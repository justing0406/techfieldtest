"""Shared caption and 1080p video export utilities; film.py supplies scenes and sound."""
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
