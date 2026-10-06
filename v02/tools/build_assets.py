import glob, os, json, subprocess, numpy as np
from PIL import Image
OUT='site/assets/mechs'; meta={}
import sys
NAMES={'blackgold':'black_gold_mecha','tannavy':'tan_navy_mecha','boss':'boss_mech','owner1':'owner clip1','owner2':'owner clip2','owner3':'owner clip3'}
CLIPS=sys.argv[1:] or ['blackgold','tannavy','boss']
QUAL={'owner1':62,'owner2':62,'owner3':62}
H_BY={'owner1':300,'owner2':300,'owner3':300}
if os.path.exists('site/assets/mechs/_sheets.json'): meta=json.load(open('site/assets/mechs/_sheets.json'))
for n in CLIPS:
    fs=sorted(glob.glob(f'keyed/{n}/k_*.png')); ims=[Image.open(f).convert('RGBA') for f in fs]
    bb=[im.getbbox() for im in ims]; u=[min(b[0] for b in bb)-4,min(b[1] for b in bb)-4,max(b[2] for b in bb)+4,max(b[3] for b in bb)+4]
    u=[max(u[0],0),max(u[1],0),min(u[2],ims[0].width),min(u[3],ims[0].height)]; cw,ch=u[2]-u[0],u[3]-u[1]; H=H_BY.get(n,330); W=round(cw*H/ch/2)*2
    fr=[im.crop(u).resize((W,H),Image.LANCZOS) for im in ims]
    d=f'{OUT}/{n}'; os.makedirs(d+'/frames',exist_ok=True)
    for i,f in enumerate(fr): f.save(f'{d}/frames/{i:03d}.png',optimize=True)
    cols=8; rows=-(-len(fr)//cols); sheet=Image.new('RGBA',(cols*W,rows*H),(0,0,0,0))
    for i,f in enumerate(fr): sheet.paste(f,((i%cols)*W,(i//cols)*H))
    sheet.save(f'{d}/sheet.webp',quality=QUAL.get(n,72),alpha_quality=70,method=6)
    sheet.quantize(colors=256,method=Image.FASTOCTREE,dither=Image.FLOYDSTEINBERG).save(f'{d}/sheet.png',optimize=True)
    fps=24
    subprocess.run(['ffmpeg','-v','error','-y','-framerate',str(fps),'-i',f'{d}/frames/%03d.png','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf','34','-auto-alt-ref','0',f'{d}/walk.webm'],check=True)
    subprocess.run(['ffmpeg','-v','error','-y','-framerate',str(fps),'-i',f'{d}/frames/%03d.png','-c:v','libwebp_anim','-lossless','0','-q:v','78','-loop','0',f'{d}/walk_anim.webp'],check=True)
    meta[n]={'source':NAMES[n],'frames':len(fr),'frameW':W,'frameH':H,'cols':cols,'rows':rows,'fps':fps}
    print(n,meta[n],{os.path.basename(p):os.path.getsize(p)//1024 for p in glob.glob(d+'/*.*')}, 'frames dir KB',sum(os.path.getsize(p) for p in glob.glob(d+'/frames/*'))//1024)
json.dump(meta,open('site/assets/mechs/_sheets.json','w'),indent=1)
