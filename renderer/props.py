import math
from PIL import Image, ImageDraw, ImageFilter
from art import INK, PAPER, PURPLE, LAV, ORANGE, YELLOW, MINT, BLUE, RED

def cloud(im,x,y,s=1,t=0,angry=False,rain=False,talking=False):
    layer=Image.new('RGBA',(540,470));d=ImageDraw.Draw(layer)
    # Union of native ellipse shapes, outlined only at the outside edge.
    mask=Image.new('L',(540,470));md=ImageDraw.Draw(mask)
    for box in [(48,139,220,260),(108,87,282,257),(216,56,419,258),(355,119,495,261)]:
        md.ellipse(box,fill=255)
    md.rounded_rectangle((113,147,436,263),radius=45,fill=255)
    layer.paste(INK,(0,0,540,470),mask.filter(ImageFilter.MaxFilter(17)))
    layer.paste('white',(0,0,540,470),mask)
    d=ImageDraw.Draw(layer)
    for xx in [190,330]:
        if int(t*3.2)%19==0:d.line((xx,158,xx+30,161),fill=INK,width=8)
        else:d.ellipse((xx,139,xx+29,173),fill=INK);d.ellipse((xx+6,141,xx+13,152),fill='white')
    if angry:
        d.line((177,119,225,132),fill=INK,width=8);d.line((324,132,369,115),fill=INK,width=8)
    if talking:
        hh=8+int(11*(.5+.5*math.sin(t*18)))
        d.ellipse((244,193,290,193+hh),fill=INK)
    else:d.arc((236,171,295,218),0,180,fill=INK,width=6)
    if rain:
        for i in range(7):
            yy=282+(t*185+i*34)%155
            xx=92+i*57
            d.line((xx,yy,xx-13,yy+32),fill=BLUE,width=7)
    layer=layer.resize((round(540*s),round(470*s)),Image.Resampling.LANCZOS)
    im.paste(layer,(round(x),round(y+6*math.sin(t*2.8))),layer)

def food(im,kind,x,y,s=1,t=0,face=True,talking=False):
    layer=Image.new('RGBA',(290,350));d=ImageDraw.Draw(layer)
    d.ellipse((30,294,260,332),fill=(38,33,59,22))
    if kind=='egg':
        d.ellipse((65,34,226,296),fill='#FFFDF4',outline=INK,width=7)
        ex,ey=110,130
    elif kind=='tortilla':
        d.ellipse((25,45,270,294),fill='#F4D6A0',outline=INK,width=7)
        for i in range(15):
            xx=48+(i*43)%199;yy=75+(i*67)%185
            d.ellipse((xx,yy,xx+11,yy+9),fill='#BF8C53')
        ex,ey=105,132
    else:
        d.polygon([(34,132),(220,55),(252,244),(49,286)],fill='#FFBB4E',outline=INK,width=7)
        d.polygon([(34,132),(220,55),(224,108),(42,182)],fill='#FFDF77',outline=INK,width=5)
        for xx,yy,rr in [(68,209,15),(186,213,17),(210,130,9),(95,138,10)]:d.ellipse((xx-rr,yy-rr,xx+rr,yy+rr),fill='#DB8F36')
        ex,ey=111,175
    if face:
        for xx in [ex,ex+51]:
            if int(t*3.5)%17==0:d.line((xx,ey+11,xx+18,ey+11),fill=INK,width=6)
            else:d.ellipse((xx,ey,xx+17,ey+25),fill=INK)
        if talking:d.ellipse((ex+20,ey+44,ex+54,ey+48+int(19*(.6+.4*math.sin(t*18)))),fill=INK)
        else:d.arc((ex+14,ey+24,ex+60,ey+64),0,180,fill=INK,width=5)
        d.line((39,204,8,218+15*math.sin(t*4)),fill=INK,width=6)
        d.line((246,204,278,188+15*math.cos(t*4)),fill=INK,width=6)
    layer=layer.resize((round(290*s),round(350*s)),Image.Resampling.LANCZOS)
    im.paste(layer,(round(x),round(y+5*math.sin(t*4))),layer)
