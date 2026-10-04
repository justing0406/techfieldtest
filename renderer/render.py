"""Deterministic cartoon scene library. The model supplies JSON, never executable code."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw
import base
from base import font, wrap, ease
from art import duck, card, INK, PAPER, PURPLE, LAV, ORANGE, YELLOW, MINT, BLUE, RED
from props import cloud, food

LAYOUTS = {'chat','character','reveal','comparison','checklist','punchline'}
ACTORS = {'duck','cloud','phone','egg','tortilla','cheddar','battery'}
VOICES = {'am_puck','am_onyx','am_fenrir','af_heart'}
SFX = {'pop','boing','stamp','tick','silence'}

def validate(plan):
    if not isinstance(plan,dict) or not 6 <= len(plan.get('beats',[])) <= 12:
        raise ValueError('Invalid scene count')
    for b in plan['beats']:
        if b.get('layout') not in LAYOUTS or b.get('actor') not in ACTORS or b.get('voice') not in VOICES or b.get('sfx') not in SFX:
            raise ValueError('Unknown scene instruction')
        for key,limit in [('text',240),('caption',65),('label',48),('id',40)]:
            if not isinstance(b.get(key),str) or len(b[key])>limit or (key!='label' and not b[key].strip()):
                raise ValueError('Invalid '+key)
        if not isinstance(b.get('items'),list) or len(b['items'])>3 or any(not isinstance(s,str) or not s or len(s)>55 for s in b['items']):
            raise ValueError('Invalid scene cards')
        if not isinstance(b.get('hold'),(float,int)) or not 0 <= b['hold'] <= 1 or not .8 <= b.get('speed',0) <= 1.3:
            raise ValueError('Invalid speech timing')
    if len({b['id'] for b in plan['beats']}) != len(plan['beats']):
        raise ValueError('Repeated scene ID')

def fit(draw,value,box,size=48,color=INK,center=True):
    outer=box
    x,y,x1,y1=box
    x+=4;y+=3;x1-=4;y1-=3
    while size>=18:
        lines=wrap(draw,value,size,x1-x)
        widths=[draw.textlength(s,font=font(size)) for s in lines]
        if len(lines)*(size+10)<=y1-y and max(widths,default=0)<=x1-x:break
        size-=1
    else:raise ValueError('Text exceeds safe area')
    for i,line in enumerate(lines):
        xx=x+(x1-x-draw.textlength(line,font=font(size)))/2 if center else x
        yy=y+i*(size+10)
        # Check actual glyph bounds, including accents and descenders.
        bounds=draw.textbbox((xx,yy),line,font=font(size))
        if bounds[0]<outer[0] or bounds[2]>outer[2] or bounds[3]>outer[3]:
            raise ValueError('Text glyph outside declared bounds')
        draw.text((xx,yy),line,font=font(size),fill=color)

def prop(im,actor,x,y,scale,t,talking=True):
    if actor=='duck':duck(im,x,y,scale,t,talking=talking,blanket=False);return
    if actor=='cloud':cloud(im,x,y,scale,t,talking=talking,rain=True);return
    if actor in {'egg','tortilla','cheddar'}:food(im,actor,x,y,scale*1.5,t,talking=talking);return
    layer=Image.new('RGBA',(620,650));d=ImageDraw.Draw(layer)
    if actor=='phone':
        d.rounded_rectangle((128,37,481,590),radius=46,fill=PURPLE,outline=INK,width=9)
        d.rounded_rectangle((151,69,458,551),radius=25,fill='white',outline=INK,width=4)
        d.rounded_rectangle((257,79,352,95),radius=8,fill=INK)
        for i,col in enumerate([LAV,MINT,YELLOW]):d.rounded_rectangle((181,139+i*70,426,193+i*70),radius=12,fill=col)
    else:
        d.rounded_rectangle((84,173,503,427),radius=28,fill='white',outline=INK,width=9)
        d.rectangle((503,238,544,359),fill=INK)
        d.rounded_rectangle((110,199,163,401),radius=9,fill=RED)
    for xx in [248,354]:d.ellipse((xx,354,xx+21,384),fill=INK)
    if talking:d.ellipse((284,401,335,415+int(15*(.5+.5*math.sin(t*18)))),fill=INK)
    else:d.arc((284,384,335,436),0,180,fill=INK,width=5)
    layer=layer.resize((round(620*scale),round(650*scale)),Image.Resampling.LANCZOS)
    im.paste(layer,(round(x),round(y+6*math.sin(t*4))),layer)

class Movie:
    def __init__(self,work):
        self.config=json.loads((work/'timeline.json').read_text());validate(self.config)
        self.captions=base.caption_chunks(self.config)
    def frame(self,t):
        b=next((b for b in self.config['timeline'] if b['start']<=t<b['end']),self.config['timeline'][-1])
        u=t-b['start'];progress=ease(u/.32)
        im=Image.new('RGB',(1080,1920),PAPER);d=ImageDraw.Draw(im)
        # Keep text clear of the right-side buttons and lower descriptions.
        fit(d,b['caption'],(84,213,905,417),60)
        actor=b['actor'];layout=b['layout'];talking=t<b['speechEnd']
        if layout=='chat':
            card(d,(88,485,908,1020),'white');fit(d,'FICTIONAL GROUP CHAT',(126,520,868,565),26,PURPLE)
            d.rounded_rectangle((137,603,842,916),radius=35,fill=LAV)
            fit(d,b['label'] or b['text'],(173,641,805,868),48)
            prop(im,'duck',215,1054,.58,t,talking)
        elif layout=='character':
            d.rectangle((0,1210,1080,1920),fill='#EBD7B3');d.line((0,1210,1080,1210),fill=INK,width=7)
            scale=1.2 if actor in {'cloud','duck'} else 1.1
            prop(im,actor,120+int(40*(1-progress)),517,scale,t,talking)
            if b['label']:
                card(d,(91,1130,908,1315),YELLOW);fit(d,b['label'],(120,1160,876,1278),44)
        elif layout in {'comparison','checklist'}:
            items=b['items'];colors=[BLUE,MINT,YELLOW]
            for i,item in enumerate(items):
                yy=490+i*210+int(32*(1-ease((u-i*.16)/.25)))
                card(d,(90,yy,909,yy+179),colors[i])
                fit(d,item,(128,yy+26,871,yy+151),43,center=False)
            prop(im,actor,360,1115,.40,t,talking)
        elif layout=='reveal':
            card(d,(90,492,909,850),MINT)
            fit(d,b['label'] or b['text'],(132,539,870,802),62)
            prop(im,actor,158,903,.9,t,talking)
            for i in range(7):
                xx=140+i*107;yy=901+int(35*math.sin(t*5+i));d.ellipse((xx,yy,xx+13,yy+13),fill=PURPLE)
        else:
            prop(im,actor,128,611,1.15,t,talking)
            if u>.35:
                layer=Image.new('RGBA',(872,230));ld=ImageDraw.Draw(layer)
                card(ld,(15,15,835,208),ORANGE)
                fit(ld,b['label'] or b['caption'],(50,45,801,175),49)
                layer=layer.rotate(-5,Image.Resampling.BICUBIC,expand=True)
                im.paste(layer,(62,454),layer)
        d=ImageDraw.Draw(im)
        c=next((c for c in self.captions if c['start']<=t<c['end']),None)
        if c:
            d.rounded_rectangle((78,1450,920,1645),radius=25,fill=INK)
            fit(d,c['text'],(108,1481,890,1615),51,'white')
        # No promotional overlay; all content uses original visuals/audio.
        return im

def mix(work,config):
    voice,rate=sf.read(work/'audio/narration.wav',dtype='float32');n=len(voice)
    music=np.zeros(n,dtype=np.float32);fx=np.zeros(n,dtype=np.float32)
    seed=int(hashlib.sha256(config['title'].encode()).hexdigest()[:8],16);rng=np.random.default_rng(seed)
    def place(arr,at,sound):
        j=round(at*rate);ln=min(len(sound),n-j)
        if j>=0 and ln>0:arr[j:j+ln]+=sound[:ln]
    def pluck(f,dur=.25,amp=.035):
        u=np.arange(round(dur*rate))/rate
        return amp*(np.sin(2*np.pi*f*u)+.25*np.sin(4*np.pi*f*u))*np.minimum(1,u/.006)*np.exp(-u*12)
    melody=np.array([523.25,0,659.25,0,783.99,659.25,0,587.33,523.25,0,392,0,440,0,392,0])
    melody=np.roll(melody,seed%8);step=60/(110+seed%13)/2
    for i,at in enumerate(np.arange(0,config['duration'],step)):
        if melody[i%16]:place(music,at,pluck(melody[i%16]))
        if i%4==0:place(music,at,pluck([130.81,164.81,146.83,98][(i//8)%4],.45,.04))
    cues=[]
    for b in config['timeline']:
        at=b['start'];kind=b['sfx'];u=np.arange(round(.23*rate))/rate
        if kind=='silence':music[round(at*rate):round(b['end']*rate)]=0;continue
        if kind=='boing':sound=.06*np.sin(2*np.pi*(620*u-400*u*u))*np.exp(-u*15)
        elif kind=='stamp':sound=(.08*np.sin(2*np.pi*85*u)+rng.normal(0,1,len(u))*.025)*np.exp(-u*28)
        elif kind=='tick':sound=pluck(950,.09,.05)
        else:sound=pluck(660,.18,.055)
        place(fx,at+.12,sound);cues.append({'time':round(at+.12,3),'sound':kind})
        if b['layout']=='punchline':music[round(at*rate):round(b['end']*rate)]*=.12
    rms=np.sqrt(np.convolve(voice**2,np.ones(1000)/1000,mode='same'))
    music*=np.where(rms>.025,.45,1)
    voice*=.66/max(.01,float(np.max(np.abs(voice))))
    delayed=np.roll(music,round(.007*rate));delayed[:round(.007*rate)]=0
    result=np.column_stack([voice+music+fx,voice+delayed+fx])
    if np.max(np.abs(result))>=1:raise ValueError('Audio clipping')
    sf.write(work/'audio/mix.wav',result,rate)
    (work/'sound-cues.json').write_text(json.dumps(cues,indent=2))

def render(work,output,stills_only=False):
    (work/'assets').mkdir(parents=True,exist_ok=True)
    base.Movie=Movie;base.audio_mix=mix;base.INK=INK
    base.render(work,output,stills_only)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--work',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--stills-only',action='store_true');a=p.parse_args();render(a.work,a.output,a.stills_only)
