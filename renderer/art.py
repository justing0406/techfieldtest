import math
from PIL import Image,ImageDraw
from base import font,text
W,H=1080,1920
INK="#26213B"; PAPER="#FFF5DF"; PURPLE="#7763ED"; LAV="#E7DDFF"
ORANGE="#FF8754"; YELLOW="#FFD34F"; MINT="#82D5B5"; BLUE="#57BBDD"; RED="#EF6170"

def label(d,s,x,y,size=44,color=INK,width=850,center=False):
    for part in s.split('\n'):
        y=text(d,part,x,y,size=size,fill=color,width=width,center=center,spacing=9)
    return y

def pill(d,s,x,y,color=YELLOW,size=27):
    w=d.textlength(s,font=font(size))+40
    d.rounded_rectangle((x,y,x+w,y+size+30),radius=16,fill=color,outline=INK,width=3)
    d.text((x+20,y+10),s,font=font(size),fill=INK)

def card(d,box,fill='white',radius=30,outline=INK,width=5):
    x0,y0,x1,y1=box
    d.rounded_rectangle((x0+9,y0+12,x1+9,y1+12),radius=radius,fill=INK)
    d.rounded_rectangle(box,radius=radius,fill=fill,outline=outline,width=width)

def duck(im,x,y,s=1,t=0,talking=False,panic=False,blanket=False):
    layer=Image.new('RGBA',(620,660));d=ImageDraw.Draw(layer)
    d.ellipse((90,490,560,550),fill=(38,33,59,28))
    d.ellipse((104,244,483,504),fill=YELLOW,outline=INK,width=9)
    d.ellipse((239,70,451,296),fill=YELLOW,outline=INK,width=9)
    d.polygon([(405,193),(558,218),(429,255)],fill=ORANGE,outline=INK,width=7)
    d.arc((123,284,320,471),50,220,fill=INK,width=7)
    if int(t*3)%17==0 and not panic:d.line((350,158,385,160),fill=INK,width=9)
    else:
        d.ellipse((347,137,386,179),fill='white' if panic else INK,outline=INK,width=5)
        if panic:d.ellipse((362,143,375,173),fill=INK)
        else:d.ellipse((355,141,365,153),fill='white')
    if talking:d.line((437,223,539,231+int(9*math.sin(t*19))),fill=INK,width=5)
    d.line((350,117,388,110 if panic else 124),fill=INK,width=7)
    if blanket:
        d.polygon([(138,323),(325,323),(444,496),(109,496)],fill=PURPLE,outline=INK,width=7)
        for yy in range(350,480,45):d.line((150,yy,380,yy),fill=LAV,width=9)
        d.rounded_rectangle((424,365,538,469),radius=15,fill='white',outline=INK,width=6)
        d.arc((508,384,566,447),260,100,fill=INK,width=7)
        d.text((448,390),'NO',font=font(29),fill=INK)
    else:
        d.polygon([(262,289),(352,308),(323,343),(271,332)],fill='white',outline=INK,width=5)
        d.polygon([(308,333),(323,344),(331,425),(305,447),(292,420),(299,346)],fill=PURPLE,outline=INK,width=5)
    if panic:
        d.polygon([(411,87),(423,109),(415,124),(401,117)],fill=BLUE,outline=INK)
    layer=layer.resize((round(620*s),round(660*s)),Image.Resampling.LANCZOS)
    im.paste(layer,(round(x),round(y+7*math.sin(t*4))),layer)
