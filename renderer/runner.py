"""Claim/render/upload jobs. GitHub OIDC tokens are requested in memory per API call."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parent
MODEL_FILES={
 'kokoro-v1.0.int8.onnx':'ae315a79b623f244700e4afb9246c46a26066782e049ba174bf3ba433970ee9c',
 'voices-v1.0.bin':'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'}

def identity():
    url=os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'];separator='&' if '?' in url else '?'
    request=urllib.request.Request(url+separator+'audience=techfieldtest-render',headers={'Authorization':'Bearer '+os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)['value']

def api(path,data=None,method='POST',file=None,lease=None):
    origin=os.environ['WORKER_URL'].rstrip('/')
    if urllib.parse.urlsplit(origin).scheme!='https':raise ValueError('WORKER_URL must use HTTPS')
    headers={'Authorization':'Bearer '+identity()}
    if file:
        payload=file.read_bytes();headers['Content-Type']='video/mp4' if file.suffix=='.mp4' else 'image/jpeg'
        headers['Content-Length']=str(len(payload));headers['X-Render-Lease']=lease
    else:payload=json.dumps(data or {}).encode();headers['Content-Type']='application/json'
    request=urllib.request.Request(origin+path,data=payload,headers=headers,method=method)
    try:
        with urllib.request.urlopen(request,timeout=90) as response:return json.load(response)
    except urllib.error.HTTPError as e:
        try:message=json.load(e).get('error','API request failed')
        except Exception:message='API request failed'
        raise RuntimeError(f'Worker returned {e.code}: {message}') from None

def claim(work,initial=False):
    work.mkdir(parents=True,exist_ok=True)
    # Push-triggered smoke production waits for the existing Cloudflare build.
    # Hourly runs recover any initial build delay and expired rendering leases.
    deadline=time.monotonic()+600
    while True:
        try:
            api('/api/daily/run' if initial else '/api/renderer/daily')
            job=api('/api/renderer/claim')['job']
            if job or not initial or time.monotonic()>deadline:break
            time.sleep(15)
        except RuntimeError:
            if not initial or time.monotonic()>deadline:raise
            time.sleep(15)
    (work/'job.json').write_text(json.dumps(job,indent=2))
    has_job=bool(job)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'],'a') as output:output.write('has_job='+str(has_job).lower()+'\n')
    print('Claimed a render job.' if has_job else 'No finished scripts waiting for rendering.')
    return job

def models(directory):
    directory.mkdir(parents=True,exist_ok=True)
    for filename,expected in MODEL_FILES.items():
        path=directory/filename
        if not path.exists():
            url='https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/'+filename
            temporary=path.with_suffix('.download');urllib.request.urlretrieve(url,temporary);temporary.replace(path)
        if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise ValueError('Voice model checksum mismatch: '+filename)

def produce(job,directory,modeldir):
    from render import validate
    validate(job['plan'])
    work=directory/job['videoId']/job['leaseId'];work.mkdir(parents=True,exist_ok=True)
    (work/'models').symlink_to(modeldir.resolve(),target_is_directory=True)
    (work/'project.json').write_text(json.dumps(job['plan'],indent=2))
    commands=[['narration.py','--project',str(work/'project.json'),'--work',str(work)],
              ['render.py','--work',str(work),'--output',str(work/'video.mp4')],
              ['qa.py','--work',str(work),'--video',str(work/'video.mp4')]]
    for command in commands:subprocess.run([sys.executable,str(ROOT/command[0]),*command[1:]],check=True,timeout=900)
    for kind,filename in [('video','video.mp4'),('poster','poster.jpg')]:
        api('/api/renderer/'+job['videoId']+'/'+kind,method='PUT',file=work/filename,lease=job['leaseId'])
    qa=json.loads((work/'qa.json').read_text())
    # Completion is idempotent, including a lost HTTP response after committing.
    for attempt in range(3):
        try:return api('/api/renderer/'+job['videoId']+'/complete',{'leaseId':job['leaseId'],'qa':qa})
        except (RuntimeError,urllib.error.URLError):
            if attempt==2:raise
            time.sleep(2)

def run(directory,modeldir):
    job=json.loads((directory/'job.json').read_text())
    models(modeldir)
    for index in range(2):
        if not job:break
        try:
            result=produce(job,directory,modeldir);print('Finished video:',result.get('videoUrl','Already saved'))
        except Exception as error:
            # Avoid dumping credentials or server responses into public logs.
            message='Rendering/upload failed: '+type(error).__name__
            try:api('/api/renderer/'+job['videoId']+'/fail',{'leaseId':job['leaseId'],'error':message})
            except Exception:pass  # Lease expiration provides recovery.
            raise
        if index==0:job=api('/api/renderer/claim')['job']

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['claim','run']);p.add_argument('--work',type=Path,default=Path('render-work'))
    p.add_argument('--models',type=Path,default=Path.home()/'.cache/techfieldtest/models');p.add_argument('--initial',action='store_true')
    a=p.parse_args()
    if a.mode=='claim':claim(a.work,a.initial)
    else:run(a.work,a.models)
