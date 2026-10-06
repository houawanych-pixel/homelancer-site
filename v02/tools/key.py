"""Blue-screen keyer: blue-dominance matte + unmix + edge despill. Usage: key.py <in_dir> <out_dir> t0 t1 [step]"""
import sys, glob, os, numpy as np
from PIL import Image, ImageFilter
ind,outd,t0,t1=sys.argv[1],sys.argv[2],float(sys.argv[3]),float(sys.argv[4]); step=int(sys.argv[5]) if len(sys.argv)>5 else 1
os.makedirs(outd,exist_ok=True)
K=np.array([0,0,254.0])
files=sorted(glob.glob(ind+"/f_*.png"))[::step]
stats=[]
for i,f in enumerate(files):
    C=np.array(Image.open(f).convert('RGB')).astype(np.float32)
    r,g,b=C[...,0],C[...,1],C[...,2]
    d=b-np.maximum(r,g)                         # blue dominance
    a=np.clip(1-(d-t0)/(t1-t0),0,1)
    # shrink matte 1px to kill the outer fringe ring
    am=Image.fromarray((a*255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))
    a=np.minimum(a,np.array(am).astype(np.float32)/255*1.0+ (a>=0.999)*0)  # min filter
    F=C.copy()
    m=(a>0.01)&(a<0.999)
    F[m]=(C[m]-(1-a[m,None])*K)/a[m,None]       # unmix the key colour out of soft edges
    F=np.clip(F,0,255)
    # edge despill: within 2px of transparency, cap blue at max(r,g)+12
    near=np.array(Image.fromarray(((a<0.999)*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)))>0
    cap=np.maximum(F[...,0],F[...,1])+12
    F[...,2]=np.where(near,np.minimum(F[...,2],cap),F[...,2])
    out=np.dstack([F,a*255]).astype(np.uint8); out[a<=0.01]=0
    Image.fromarray(out,'RGBA').save(f"{outd}/k_{i:04d}.png",optimize=True)
    al=out[...,3].astype(int); edge=(al>0)&(al<255); o=out.astype(int)
    bl=(o[...,2]>o[...,0]+40)&(o[...,2]>o[...,1]+40)
    stats.append(((edge&bl).sum(),edge.sum()))
print(len(files),"frames; bluish-edge px per frame max/avg:",max(s[0] for s in stats),round(sum(s[0] for s in stats)/len(stats),1),"of edge px avg",round(sum(s[1] for s in stats)/len(stats)))
