import bpy, sys, math
argv=sys.argv[sys.argv.index("--")+1:]
model, outdir, frames_mode = argv[0], argv[1], argv[2]   # frames_mode: "preview" or "all"
SRC="/workspace/homelancer-mech-site/src/"
bpy.ops.wm.read_factory_settings(use_empty=True)
# 1) import walk action from anim pack
MP = model if model.startswith("/") else SRC+model
bpy.ops.import_scene.gltf(filepath=MP)
walk=bpy.data.actions.get("Walk")
if walk is None:
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=SRC+"anim_pack_04.glb")
    walk=bpy.data.actions["walk"]; walk.use_fake_user=True; walk.name="WALK_SRC"
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=MP)
    print("USING anim_pack_04 walk")
for o in list(bpy.data.objects):
    if o.name.startswith("Icosphere"): bpy.data.objects.remove(o, do_unlink=True)
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
meshes=[o for o in bpy.data.objects if o.type=='MESH']
# fcurves (Blender 5 layered actions)
def fcurves(a):
    try: return list(a.fcurves)
    except Exception: return [fc for l in a.layers for s in l.strips for cb in s.channelbags for fc in cb.fcurves]
# flatten root drift so the walk is in place
for fc in fcurves(walk):
    if fc.data_path.endswith('location') and (fc.data_path.count('.')>=1):
        ks=fc.keyframe_points
        if len(ks)>1 and abs(ks[-1].co[1]-ks[0].co[1])>0.02:
            print("FLATTEN",fc.data_path,fc.array_index,ks[0].co[1],ks[-1].co[1])
            t0,t1=ks[0].co[0],ks[-1].co[0]; d=ks[-1].co[1]-ks[0].co[1]
            for k in ks:
                off=d*(k.co[0]-t0)/(t1-t0)
                k.co[1]-=off; k.handle_left[1]-=off; k.handle_right[1]-=off
arm.animation_data_create()
arm.animation_data.action=walk
try:
    if walk.slots: arm.animation_data.action_slot=walk.slots[0]
except Exception as e: print("slot",e)
sc=bpy.context.scene
f0,f1=int(walk.frame_range[0]),int(walk.frame_range[1])
sc.frame_start=f0; sc.frame_end=f1-1   # last frame == first frame for a looping cycle
sc.render.fps=30
# bounds
sc.frame_set(f0)
import mathutils
dg=bpy.context.evaluated_depsgraph_get()
pts=[]
for m in meshes:
    me=m.evaluated_get(dg)
    pts+= [me.matrix_world @ mathutils.Vector(c) for c in me.bound_box]
zmin=min(p.z for p in pts); zmax=max(p.z for p in pts); h=zmax-zmin
cx=sum(p.x for p in pts)/len(pts); cy=sum(p.y for p in pts)/len(pts)
print("BOUNDS",zmin,zmax,cx,cy)
# camera: orthographic side view (from -X looking +X) so the mech walks to screen-right
cam=bpy.data.objects.new("Cam",bpy.data.cameras.new("Cam")); sc.collection.objects.link(cam); sc.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=h*1.25
yaw=math.radians(22); cam.location=(cx+10*math.cos(yaw), cy-10*math.sin(yaw), zmin+h*0.5+1.2); cam.rotation_euler=(math.radians(83),0,math.radians(90)-yaw)
if argv[3:]=="flip": pass
# lights: neutral key + rim; world: blue only for camera rays
for nm,rot,en in [("Key",(50,0,60),6.0),("Fill",(60,0,-120),3.0),("Top",(0,0,0),2.5)]:
    L=bpy.data.objects.new(nm,bpy.data.lights.new(nm,'SUN')); L.data.energy=en
    L.rotation_euler=tuple(math.radians(a) for a in rot); sc.collection.objects.link(L)
w=bpy.data.worlds.new("W"); sc.world=w; w.use_nodes=True; nt=w.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
out=nt.nodes.new("ShaderNodeOutputWorld"); lp=nt.nodes.new("ShaderNodeLightPath")
mix=nt.nodes.new("ShaderNodeMixShader")
blue=nt.nodes.new("ShaderNodeBackground"); blue.inputs[0].default_value=(0.0,0.0,1.0,1); blue.inputs[1].default_value=1.0
grey=nt.nodes.new("ShaderNodeBackground"); grey.inputs[0].default_value=(0.5,0.5,0.5,1); grey.inputs[1].default_value=1.0
nt.links.new(lp.outputs["Is Camera Ray"],mix.inputs[0]); nt.links.new(grey.outputs[0],mix.inputs[1]); nt.links.new(blue.outputs[0],mix.inputs[2]); nt.links.new(mix.outputs[0],out.inputs[0])
sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=24; sc.cycles.use_denoising=True
sc.view_settings.view_transform='Standard'
sc.render.resolution_x=480; sc.render.resolution_y=480
sc.render.image_settings.file_format='PNG'
sc.render.filepath=outdir+"/f_"
if frames_mode=="preview":
    sc.frame_set(f0); sc.render.filepath=outdir+"/preview.png"; bpy.ops.render.render(write_still=True)
else:
    bpy.ops.render.render(animation=True)
print("FRAMES",f0,f1-1)
