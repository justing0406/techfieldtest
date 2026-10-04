"""Render the verified test replay as a 1080x1920 original short with audio."""
import argparse
import json
import math
import subprocess
from functools import lru_cache
from pathlib import Path
import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
INK = '#0B101B'
PANEL = '#171F2C'
WHITE = '#F6F5EE'
GRAY = '#A5AFBD'
LIME = '#D5FC4C'
CORAL = '#FF795F'


@lru_cache(maxsize=60)
def font(size, mono=False):
    name = 'DejaVuSansMono-Bold.ttf' if mono else 'DejaVuSans-Bold.ttf'
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/' + name, int(size))


def ease(value):
    return 1 - (1 - max(0, min(1, value))) ** 3


def wrap(draw, value, size, width, mono=False):
    lines, current = [], ''
    for word in value.split():
        trial = (current + ' ' + word).strip()
        if draw.textlength(trial, font=font(size, mono)) > width and current:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


def text(draw, value, x, y, size=64, fill=WHITE, width=850, spacing=12, mono=False, center=False):
    for line in wrap(draw, value, size, width, mono):
        position = x + (width - draw.textlength(line, font=font(size, mono))) / 2 if center else x
        draw.text((position, y), line, font=font(size, mono), fill=fill)
        y += size + spacing
    return y


def badge(draw, value, x, y, color=LIME, size=25):
    width = draw.textlength(value, font=font(size)) + 34
    draw.rounded_rectangle((x, y, x + width, y + size + 25), radius=12, fill=color)
    draw.text((x + 17, y + 8), value, font=font(size), fill=INK)


def cursor(draw, x, y, pressed=False):
    draw.polygon([(x,y),(x+14,y+62),(x+26,y+44),(x+50,y+54),(x+60,y+31)], fill=WHITE, outline=INK, width=4)
    if pressed:
        draw.ellipse((x-24,y-24,x+24,y+24), outline=LIME, width=6)


def caption_chunks(config):
    chunks = []
    for beat in config['timeline']:
        words = beat['text'].split()
        groups = [' '.join(words[i:i+5]) for i in range(0,len(words),5)]
        total = sum(len(group) for group in groups)
        elapsed = beat['start']
        for index, group in enumerate(groups):
            duration = (beat['speechEnd'] - beat['start']) * len(group) / total
            chunks.append({'start':elapsed, 'end':beat['end'] if index==len(groups)-1 else elapsed+duration, 'text':group})
            elapsed += duration
    return chunks


class Movie:
    def __init__(self, work):
        self.work = work
        self.config = json.loads((work / 'timeline.json').read_text())
        self.evidence = json.loads((work / 'evidence.json').read_text())
        assert all(self.evidence['overlay'][key] for key in ['pinFoundByMuPDF','pinFoundByPyPDF'])
        assert not any(self.evidence['redacted'][key] for key in ['pinFoundByMuPDF','pinFoundByPyPDF'])
        self.images = {name:Image.open(work / f'assets/{name}.png').convert('RGB') for name in ['original','overlay','redacted']}
        self.crops = {name:im.crop((0,160,960,870)).resize((830,614),Image.Resampling.LANCZOS) for name,im in self.images.items()}
        self.pin_crops = {name:im.crop((40,350,500,615)).resize((380,219),Image.Resampling.LANCZOS) for name,im in self.images.items()}
        self.captions = caption_chunks(self.config)
        self.bg = Image.new('RGB',(W,H),INK)
        d = ImageDraw.Draw(self.bg)
        for y in range(0,H,64):
            d.line((0,y,W,y),fill='#101725',width=1)
        for x in range(0,W,64):
            d.line((x,0,x,H),fill='#101725',width=1)
        d.ellipse((570,1170,1470,2070),fill='#15231D')
        d.ellipse((-400,-440,620,300),fill='#1E2026')

    def paper(self, frame, name, y=470, local=1, label=True):
        d=ImageDraw.Draw(frame)
        y += round(55 * (1-ease(local/.3)))
        d.rounded_rectangle((84,y+15,951,y+712),radius=26,fill='#020408')
        d.rounded_rectangle((76,y,943,y+697),radius=24,fill=WHITE)
        d.rounded_rectangle((76,y,943,y+65),radius=24,fill='#E7EBEC')
        d.rectangle((76,y+40,943,y+65),fill='#E7EBEC')
        for n,color in enumerate(['#FF795F','#E4BD55','#89B896']):
            d.ellipse((100+n*29,y+20,117+n*29,y+37),fill=color)
        d.text((240,y+14),name+'.pdf',font=font(27,True),fill='#253140')
        frame.paste(self.crops[name],(95,y+69))
        if label:
            badge(d,'FAKE PIN / REAL FILE',97,y+718,size=24)

    def terminal(self, frame, result, local, y=470):
        d=ImageDraw.Draw(frame)
        d.rounded_rectangle((77,y,943,y+690),radius=28,fill=PANEL,outline='#354253',width=3)
        d.text((115,y+28),'TEXT EXTRACTED FROM PDF',font=font(27,True),fill=GRAY)
        d.line((112,y+82,906,y+82),fill='#354253',width=2)
        text(d,'DEMO ACCESS PIN',115,y+125,size=38,mono=True,fill=GRAY)
        if result=='overlay':
            progress=ease(local/.35)
            size=round(160+10*math.sin(progress*math.pi))
            d.text((120,y+235),'4827',font=font(size,True),fill=LIME)
            badge(d,'FOUND IN THE FILE',115,y+475,CORAL,30)
            text(d,'The overlay hid the view.',115,y+560,size=36)
        else:
            text(d,'[no PIN text]',115,y+250,size=64,mono=True,fill=LIME)
            badge(d,'4827 NOT FOUND',115,y+475,LIME,30)
            text(d,'Checked with two PDF readers.',115,y+560,size=31)

    def frame(self, t):
        beat=next((beat for beat in self.config['timeline'] if t<beat['end']),self.config['timeline'][-1])
        local=max(0,t-beat['start'])
        fraction=min(1,local/max(.01,beat['end']-beat['start']))
        name=beat['id']
        im=self.bg.copy(); d=ImageDraw.Draw(im)
        d.text((80,108),'TECHFIELDTEST',font=font(29),fill=WHITE)
        d.text((660,112),'EXPERIMENT 001',font=font(23,True),fill=GRAY)
        d.rectangle((80,163,940,168),fill='#303946')
        d.rectangle((80,163,80+860*t/self.config['duration'],168),fill=LIME)
        head_size=70 if name not in ['hook','share'] else 76
        text(d,beat['caption'],80,220-round(20*(1-ease(local/.22))),size=head_size,fill=CORAL if name in ['hook','reveal'] else WHITE,width=850)
        if name in ['hook','cover','extract','share']:
            variant='original' if name=='cover' and fraction<.30 else 'overlay'
            self.paper(im,variant,y=530 if name=='share' else 470,local=local,label=name!='share')
            d=ImageDraw.Draw(im)
            if name in ['hook','cover']:
                pulse=6+round(4*math.sin(t*8))
                d.rounded_rectangle((137,741,390,892),radius=7,outline=CORAL if name=='hook' else LIME,width=pulse)
                cursor(d,417+20*math.sin(t*2),911,pressed=local>.5)
            if name=='extract':
                badge(d,'EXTRACT TEXT',388,1120,LIME,32)
                cursor(d,718-150*ease(local/1.0),1240-85*ease(local/1.0),pressed=local>1.0)
            if name=='share':
                badge(d,'SAVE IT. SHARE IT.',97,1270,LIME,30)
        elif name in ['reveal','verify']:
            self.terminal(im,'overlay' if name=='reveal' else 'redacted',local)
        elif name=='mechanism':
            text(d,'WHAT THE FILE CONTAINS',90,475,size=30,fill=GRAY)
            d.rounded_rectangle((90,610,930,985),radius=22,fill=WHITE)
            d.text((175,740),'4827',font=font(145,True),fill=INK)
            shift=180*ease(local/2.0)
            d.rounded_rectangle((145,710-shift,720,930-shift),radius=4,fill='#000000')
            badge(d,'RECTANGLE LAYER',395,565-shift,CORAL,24)
            badge(d,'TEXT LAYER',160,1060,LIME,28)
            text(d,'Covering text leaves it in the PDF.',90,1160,size=36)
        elif name=='curtain':
            d.rounded_rectangle((90,540,930,1090),radius=20,fill=WHITE)
            d.text((190,720),'4827',font=font(140,True),fill=INK)
            opening=ease(local/1.6)*320
            for left,right in [(90,510-opening),(510+opening,930)]:
                d.rectangle((left,540,right,1090),fill=CORAL)
                for x in range(int(left)+15,int(right),38):
                    d.line((x,540,x,1090),fill='#D55D49',width=9)
            d.line((70,530,950,530),fill=LIME,width=12)
            text(d,'THE TEXT NEVER LEFT.',90,1170,size=45,fill=LIME,center=True)
        elif name=='fix':
            labels=['REDACT','APPLY','SAVE']
            selected=min(2,int(fraction*3))
            for index,label in enumerate(labels):
                y=465+index*225
                active=index<=selected
                d.rounded_rectangle((90,y,930,y+175),radius=25,fill=LIME if active else PANEL)
                d.text((135,y+45),str(index+1).zfill(2),font=font(57,True),fill=INK if active else GRAY)
                d.text((280,y+45),label,font=font(65),fill=INK if active else WHITE)
            text(d,'Applied to our synthetic test PDF.',90,1190,size=32,fill=GRAY)
        elif name=='compare':
            for x,variant,color,title,result in [(80,'overlay',CORAL,'OVERLAY','PIN STILL THERE'),(530,'redacted',LIME,'REDACTION','PIN REMOVED')]:
                d.rounded_rectangle((x,485,x+400,1150),radius=22,fill=PANEL,outline=color,width=4)
                text(d,title,x+20,525,size=37,fill=color,width=360,center=True)
                im.paste(self.pin_crops[variant],(x+10,650))
                text(d,result,x+25,925,size=40,fill=color,width=350,center=True)
            text(d,'BOTH LOOK BLACKED OUT.',80,1200,size=42,fill=WHITE,width=850,center=True)
        elif name=='check':
            for index,label in enumerate(['CHECK THE SAVED COPY','TRY TEXT EXTRACTION','REMOVE HIDDEN INFO']):
                y=500+index*215
                d.rounded_rectangle((90,y,930,y+160),radius=22,fill=PANEL)
                d.text((125,y+50),'0'+str(index+1),font=font(40,True),fill=LIME)
                text(d,label,230,y+45,size=41,width=650)
            text(d,'Metadata needs its own cleanup.',90,1200,size=33,fill=GRAY)
        caption=next((c for c in self.captions if c['start']<=t<c['end']),None)
        if caption:
            lines=wrap(d,caption['text'],49,795)
            box_h=len(lines)*62+35
            d.rounded_rectangle((77,1370,943,1370+box_h),radius=20,fill='#03070D')
            text(d,caption['text'],110,1384,size=49,width=800,center=True,spacing=13)
        d.text((82,1585),'FAKE DATA  /  VERIFIED TEST REPLAY',font=font(23,True),fill=GRAY)
        if name in ['reveal','verify'] and local<.08:
            im=Image.blend(im,Image.new('RGB',(W,H),WHITE),.18*(1-local/.08))
        return im


def audio_mix(work, config):
    voice, rate = sf.read(work / 'audio/narration.wav',dtype='float32')
    n=len(voice); t=np.arange(n,dtype=np.float64)/rate
    bed=np.zeros(n,dtype=np.float64)
    for beat in np.arange(0,config['duration'],.43):
        start=int(beat*rate); length=min(int(.18*rate),n-start)
        if length<=0: continue
        u=np.arange(length)/rate
        note=[110,110,130.8128,146.8324][int(beat/.43)%4]
        bed[start:start+length]+=np.sin(2*np.pi*note*u)*np.exp(-u*22)*.014
        bed[start:start+length]+=np.sin(2*np.pi*880*u)*np.exp(-u*90)*.003
    rng=np.random.default_rng(4827)
    sfx=np.zeros(n,dtype=np.float64)
    for beat in config['timeline']:
        start=int(beat['start']*rate)
        length=min(int(.16*rate),n-start)
        u=np.arange(length)/rate
        if beat['id'] in ['reveal','verify']:
            freq=660 if beat['id']=='reveal' else 880
            sound=(np.sin(2*np.pi*freq*u)+.4*np.sin(2*np.pi*freq*1.5*u))*np.exp(-u*24)*.07
        else:
            sound=rng.normal(0,1,length)*np.exp(-u*70)*.017
        sfx[start:start+length]+=sound
    peak=np.max(np.abs(voice))
    mixed=voice*(.69/max(peak,.01))+bed+sfx
    mixed*=np.minimum(1,np.maximum(0,(config['duration']-t)/.3))
    assert np.max(np.abs(mixed))<1
    sf.write(work / 'audio/mix.wav',np.column_stack([mixed,mixed]),rate)


def timestamp(seconds):
    ms=round(seconds*1000)
    return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'


def render(work, output, stills_only=False):
    movie=Movie(work)
    output.parent.mkdir(parents=True,exist_ok=True)
    samples=[b['start']+min(.9,(b['end']-b['start'])/2) for b in movie.config['timeline']]
    sheet=Image.new('RGB',(1080,math.ceil(len(samples)/4)*520),'#FFFFFF')
    for index,t in enumerate(samples):
        frame=movie.frame(t)
        frame.save(work / f'assets/scene-{index:02d}.png')
        small=frame.resize((270,480),Image.Resampling.LANCZOS)
        x=(index%4)*270; y=(index//4)*520
        sheet.paste(small,(x,y))
        ImageDraw.Draw(sheet).text((x+10,y+488),f'{t:.1f}s  '+movie.config['timeline'][index]['id'],font=font(16),fill=INK)
    sheet.save(work / 'contact-sheet.jpg',quality=94)
    srt='\n\n'.join(f'{i+1}\n{timestamp(c["start"])} --> {timestamp(c["end"])}\n{c["text"]}' for i,c in enumerate(movie.captions))+'\n'
    (work / 'captions.srt').write_text(srt)
    if stills_only: return
    audio_mix(work,movie.config)
    command=['ffmpeg','-y','-hide_banner','-loglevel','warning','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','pipe:0','-i',str(work/'audio/mix.wav'),'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart','-shortest',str(output)]
    process=subprocess.Popen(command,stdin=subprocess.PIPE)
    try:
        total=math.ceil(movie.config['duration']*FPS)
        for index in range(total):
            process.stdin.write(movie.frame(index/FPS).tobytes())
            if index%(FPS*5)==0: print(f'Rendered {index/FPS:.0f}/{movie.config["duration"]:.1f}s',flush=True)
        process.stdin.close()
        if process.wait()!=0: raise RuntimeError('FFmpeg render failed')
    except BaseException:
        process.kill(); process.wait(); raise
    print('Saved:',output,flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--work',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--stills-only',action='store_true')
    args=parser.parse_args()
    render(args.work,args.output,args.stills_only)
