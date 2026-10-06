"""Keyer for the owner's light-sky-blue screen clips (non-uniform blue, gradient, floor shadow).
1) clean plate = per-pixel median of frames where the pixel looks like sky; holes filled by blur-diffusion
2) alpha from RGB distance to plate (t0..t1)
3) pixels that are still sky-hued (shadow/spill: b-r>br & b-g>bg) are cut from colour and turned into a soft black shadow
4) unmix plate out of soft edges, cap blue near edges (despill)
Usage: key_owner.py <in_dir> <out_dir> c0 c1 br bg shadowStrength  (c0/c1 = chroma-ratio thresholds; br/bg only used to build the plate) [frames: start:end]"""
import sys, glob, os, numpy as np
from PIL import Image, ImageFilter
ind,outd=sys.argv[1],sys.argv[2]; t0,t1,BR,BG,SH=map(float,sys.argv[3:8])
rng=sys.argv[8] if len(sys.argv)>8 else None
os.makedirs(outd,exist_ok=True)
files=sorted(glob.glob(ind+"/f_*.png"))
def boxblur(x,k):
    x=np.pad(x.astype(np.float64),k,mode='edge'); c=x.cumsum(0); c=np.vstack([np.zeros((1,c.shape[1])),c]); x=(c[2*k+1:]-c[:-2*k-1])
    c=x.cumsum(1); c=np.hstack([np.zeros((c.shape[0],1)),c]); return ((c[:,2*k+1:]-c[:,:-2*k-1])/(2*k+1)**2).astype(np.float32)
def sky(C): r,g,b=C[...,0],C[...,1],C[...,2]; return (b-r>BR)&(b-g>BG)
plate_p=ind+"/_plate.npy"
if os.path.exists(plate_p): P=np.load(plate_p)
else:
    stack=np.stack([np.array(Image.open(f).convert('RGB')).astype(np.float32) for f in files[::3]])
    m=sky(stack)&(stack.max(-1)>215)
    s=np.where(m[...,None],stack,np.nan); P=np.nanmedian(s,axis=0)
    hole=np.isnan(P[...,0]); print("plate holes %",round(hole.mean()*100,1))
    P=np.where(np.isnan(P),0,P); w=(~hole).astype(np.float32)
    acc,ww=P*w[...,None],w.copy()
    for k in (9,25,61,151):   # diffusion fill
        bl=lambda x: boxblur(x,k)
        A=np.dstack([bl(acc[...,c]) for c in range(3)]); W=bl(ww)
        fill=(ww<0.5)&(W>1e-3); P=np.where(fill[...,None],A/np.maximum(W,1e-6)[...,None],P); ww=np.where(fill,1.0,ww); acc=P*ww[...,None]
    np.save(plate_p,P)
sel=files if not rng else files[int(rng.split(':')[0]):int(rng.split(':')[1])]
for i,f in enumerate(sel):
    C=np.array(Image.open(f).convert('RGB')).astype(np.float32)
    # chroma matte relative to the plate's own blue cast: bg-ness = min((b-r)/(Pb-Pr),(b-g)/(Pb-Pg))
    rbr=(C[...,2]-C[...,0])/np.maximum(P[...,2]-P[...,0],10); rbg=(C[...,2]-C[...,1])/np.maximum(P[...,2]-P[...,1],10)
    bgn=np.clip((np.minimum(rbr,rbg)-t0)/(t1-t0),0,1)
    d=np.sqrt(((C-P)**2).sum(-1)); bgn=np.where(d<10,1,bgn)
    a=1-bgn; sk=bgn>0.5
    am=np.array(Image.fromarray((a*255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))).astype(np.float32)/255
    a=np.minimum(a,np.maximum(am,(a>=0.999)*am)); 
    a=np.array(Image.fromarray((a*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(np.float32)/255
    F=C.copy(); m=(a>0.02)&(a<0.98)
    F[m]=(C[m]-(1-a[m,None])*P[m])/a[m,None]; F=np.clip(F,0,255)
    near=np.array(Image.fromarray(((a<0.98)*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)))>0
    cap=np.maximum(F[...,0],F[...,1])+8; F[...,2]=np.where(near,np.minimum(F[...,2],cap),F[...,2])
    # shadow: darker-than-plate sky pixels -> black at partial alpha
    lumC=C.mean(-1); lumP=P.mean(-1); sh=np.clip((lumP-lumC)/np.maximum(lumP,1)*SH,0,0.6)*sk
    outA=np.maximum(a,sh); F=np.where((a<sh)[...,None],0,F)
    outA=np.where(outA<0.08,0,outA)
    ys,xs=np.where(a>0.8)                      # keep only a box around the solid mech (+ shadow band under the feet)
    if len(ys):
        keep=np.zeros_like(outA,bool); keep[max(ys.min()-12,0):ys.max()+26, max(xs.min()-30,0):xs.max()+31]=True; outA=outA*keep
    out=np.dstack([F,outA*255]).astype(np.uint8); out[outA<=0.02]=0
    Image.fromarray(out,'RGBA').save(f"{outd}/k_{i:04d}.png")
print("keyed",len(sel))
