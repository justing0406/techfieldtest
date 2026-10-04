"""Verify the actual encoded media, not requested rendering settings."""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from render import Movie

def check(work,video):
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
    v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio')
    numerator,denominator=map(int,v['avg_frame_rate'].split('/'));duration=float(probe['format']['duration'])
    result=subprocess.run(['ffmpeg','-hide_banner','-v','error','-i',str(video),'-f','null','-'],capture_output=True,text=True,check=True)
    if result.stderr.strip():raise ValueError('Encoded video did not decode cleanly')
    sound=subprocess.run(['ffmpeg','-hide_banner','-i',str(video),'-vn','-af','ebur128=peak=true','-f','null','-'],capture_output=True,text=True,check=True).stderr
    final=sound.rsplit('Summary:',1)[-1]
    loudness=float(re.search(r'I:\s*(-?[\d.]+) LUFS',final)[1]);peak=float(re.search(r'Peak:\s*(-?[\d.]+) dBFS',final)[1])
    movie=Movie(work)
    # Check caption grouping and text at the beginning, middle and end of every
    # caption and scene. fit() raises on overflow; this doesn't assess meaning.
    for c in movie.captions:
        for t in [c['start']+.001,(c['start']+c['end'])/2,max(c['start'],c['end']-.001)]:movie.frame(t)
    for b in movie.config['timeline']:
        for delta in [.05,.4,1.0]:movie.frame(min(b['end']-.001,b['start']+delta))
    if abs(duration-movie.config['duration'])>.15:raise ValueError('Narration/video duration mismatch')
    qa={'version':1,'width':v['width'],'height':v['height'],'fps':numerator/denominator,
        'videoCodec':v['codec_name'],'audioCodec':a['codec_name'],'durationSeconds':round(duration,3),
        'integratedLufs':loudness,'truePeakDb':peak,'decoded':True,'captionBoundsChecked':True,
        'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'scope':'Technical checks only; captions use estimated phrase timing.'}
    qa['passed']=v['width']==1080 and v['height']==1920 and numerator/denominator==30 and v['codec_name']=='h264' and a['codec_name']=='aac' and 20<=duration<=45 and -18<=loudness<=-14 and peak<=-1
    (work/'qa.json').write_text(json.dumps(qa,indent=2))
    if not qa['passed']:raise ValueError('Technical quality gate failed: '+json.dumps(qa))
    frame=movie.frame(movie.config['timeline'][0]['start']+.8);frame.save(work/'poster.jpg',quality=91)
    return qa

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--video',type=Path,required=True);a=p.parse_args()
    print(json.dumps(check(a.work,a.video),indent=2))
