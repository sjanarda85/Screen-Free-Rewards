import json, sys, datetime
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.units import mm
W,H=595.28,841.89; M=15*mm
THEMES={
 "dark":dict(bg="#161719",card="#202226",chip="#2b2d31",chipT="#d9cfb8",ink="#eeece7",mut="#9c9da0",line="#2b2d31",rule1="#d9cfb8",rule2="#d6b260",tile="#e9e2d0",tileT="#1c1c1a",track="#2b2d31",pos="#54cc88",neg="#f46c70",warn="#f2b45a",bar1="#d6b260",bar2="#d9cfb8"),
 "light":dict(bg="#f6f3ec",card="#ffffff",chip="#ebe4d3",chipT="#6b5a2e",ink="#1c1c1a",mut="#6f6e68",line="#e4ded0",rule1="#b48a2c",rule2="#d6b260",tile="#1c1c1a",tileT="#ece5d2",track="#e4ded0",pos="#1f8a4f",neg="#c4373c",warn="#a8690a",bar1="#d6b260",bar2="#b48a2c"),
}
def star(c,cx,cy,r,col):
    k=.18; p=c.beginPath(); pts=[(0,-r),(r*k,-r*k),(r,0),(r*k,r*k),(0,r),(-r*k,r*k),(-r,0),(-r*k,-r*k)]
    p.moveTo(cx+pts[0][0],cy-pts[0][1])
    for x,y in pts[1:]: p.lineTo(cx+x,cy-y)
    p.close(); c.setFillColor(HexColor(col)); c.drawPath(p,fill=1,stroke=0)
def make(data,theme,out,test=True,version="1.2.0"):
    t=THEMES[theme]; C=lambda k:HexColor(t[k]); c=canvas.Canvas(out,pagesize=(W,H)); c.setTitle("Screen Free Rewards daily summary "+data["name"]); c.setAuthor("Screen Free Rewards")
    c.setFillColor(C("bg")); c.rect(0,0,W,H,fill=1,stroke=0)
    top=H-M; y=top
    def Y(v): return H-v
    def text(x,yy,s,font="Helvetica",size=10,col="ink",align="l",spc=0):
        w=c.stringWidth(s,font,size)+spc*len(s)
        if align!="l": x=x-w
        t=c.beginText(x,Y(yy)); t.setFont(font,size); t.setFillColor(C(col)); t.setCharSpace(spc); t.textOut(s); c.drawText(t)
    # header
    ts=15*mm; y0=M
    c.setFillColor(C("tile")); c.roundRect(M,Y(y0+ts),ts,ts,4*mm*.72,fill=1,stroke=0); star(c,M+ts/2,Y(y0+ts/2),ts*.30,t["tileT"])
    text(M+ts+14,y0+16,"Screen Free Rewards","Helvetica-Bold",19)
    text(M+ts+14,y0+31,"Daily summary"+("  |  TEST" if test else ""),"Helvetica",9,"mut")
    d=data["date"]; text(W-M,y0+16,d,"Helvetica-Bold",14,"ink","r")
    text(W-M,y0+31,data["name"]+(", age %s"%data["age"] if data.get("age") else ""),"Helvetica",9,"mut","r")
    # rule gradient
    ry=y0+ts+16; c.saveState(); p=c.beginPath(); p.roundRect(M,Y(ry+3),W-2*M,3,1.5); c.clipPath(p,stroke=0,fill=0)
    c.linearGradient(M,0,W-M,0,(C("rule1"),C("rule2")),extend=False); c.restoreState()
    y=ry+3+14
    # KPIs
    gap=8.5; kw=(W-2*M-3*gap)/4; kh=62
    ks=[("BALANCE",str(data["balance"]),"points","ink"),("PENDING",str(data["pending"]),"awaiting approval","warn" if data["pending"] else "ink"),("EARNED TODAY","+%d"%data["earned"],"points","pos"),("SCREEN FREE",str(data["mins"]),"minutes today","ink")]
    for i,(l,v,s,col) in enumerate(ks):
        x=M+i*(kw+gap); c.setFillColor(C("card")); c.setStrokeColor(C("line")); c.setLineWidth(.8); c.roundRect(x,Y(y+kh),kw,kh,8,fill=1,stroke=1)
        text(x+11,y+17,l,"Helvetica-Bold",6.5,"mut",spc=1.1); text(x+11,y+43,v,"Helvetica-Bold",22,col); text(x+11,y+56,s,"Helvetica",7.5,"mut")
    y+=kh+14
    ROW=23
    def section(x,y,w,title,rows=None,lines=None,extra=None,minh=0):
        cw=c.stringWidth(title.upper(),"Helvetica-Bold",7.5)+len(title)*.9+22
        c.setFillColor(C("chip")); c.roundRect(x,Y(y+19),cw,19,2,fill=1,stroke=0); text(x+11,y+12.7,title.upper(),"Helvetica-Bold",7.5,"chipT",spc=.9)
        n=len(rows) if rows else len(lines); h=max(minh,n*ROW+(extra or 0)+4)
        c.setFillColor(C("card")); c.setStrokeColor(C("line")); c.setLineWidth(.8); c.roundRect(x,Y(y+19+h),w,h,6,fill=1,stroke=1)
        ty=y+19+2
        if rows:
            for i,(l,v,col,b) in enumerate(rows):
                yy=ty+i*ROW; text(x+14,yy+15,l,"Helvetica-Bold" if b else "Helvetica",10,"ink" if b else "mut"); text(x+w-14,yy+15,v,"Helvetica-Bold" if (b or col) else "Helvetica",10,col or "ink","r")
                if i<n-1: c.setStrokeColor(C("line")); c.line(x+14,Y(yy+ROW),x+w-14,Y(yy+ROW))
        else:
            for i,s in enumerate(lines):
                yy=ty+i*ROW; text(x+14,yy+15,s[:70],"Helvetica",10,"ink" if not s.startswith("None") and not s.startswith("No ") else "mut")
                if i<n-1: c.setStrokeColor(C("line")); c.line(x+14,Y(yy+ROW),x+w-14,Y(yy+ROW))
        return y+19+h
    fw=W-2*M
    y=section(M,y,fw,"Child",[("Name",data["name"],None,False),("Age",str(data.get("age") or "-"),None,False),("Status","Needs attention" if data["open"] else "All clear","warn" if data["open"] else "pos",True)])+14
    cw2=(fw-14)/2
    pts=[("Balance","%d pts"%data["balance"],None,True),("Pending approval","%d pts"%data["pending"],"warn" if data["pending"] else None,False),("Earned today","+%d pts"%data["earned"],"pos",False),("Redeemed today","-%d pts"%data["redeemed"],"neg" if data["redeemed"] else None,False)]
    pct=min(100,round(data["mins"]/data["scheduled"]*100)) if data["scheduled"] else 0
    st=[("Scheduled today","%d min"%data["scheduled"],None,False),("Actual timer","%d min"%data["mins"],None,True),("Unused","%d min"%data["unused"],None,False)]
    e1=section(M,y,cw2,"Points",rows=pts,minh=4*ROW+14)
    e2=section(M+cw2+14,y,cw2,"Screen-free time",rows=st,extra=ROW+10)
    bx=M+cw2+14+14; by=y+19+2+3*ROW+6; bw=cw2-28
    c.setFillColor(C("track")); c.roundRect(bx,Y(by+8),bw,8,4,fill=1,stroke=0)
    if pct: 
        c.saveState(); p=c.beginPath(); p.roundRect(bx,Y(by+8),bw*pct/100,8,4); c.clipPath(p,stroke=0,fill=0); c.linearGradient(bx,0,bx+bw,0,(C("bar1"),C("bar2")),extend=False); c.restoreState()
    text(bx,by+22,"%d%% of today's window used"%pct,"Helvetica",8,"mut")
    y=max(e1,e2)+14
    op=["%s: %s%s"%(r["kind"],r["name"],(" (%d pts)"%r["cost"]) if r.get("cost") else "") for r in data["open"]] or ["None."]
    tk=["%s (+%d pts)"%(x["title"],x["pts"]) for x in data["tasks"]] or ["None."]
    n=max(len(op),len(tk)); op+=[""]*0
    e1=section(M,y,cw2,"Open requests (%d)"%len(data["open"]),lines=op,minh=max(len(op),len(tk))*ROW+4); e2=section(M+cw2+14,y,cw2,"Open tasks (%d)"%len(data["tasks"]),lines=tk,minh=max(len(op),len(tk))*ROW+4); y=max(e1,e2)+14
    act=["%s  |  %s: %s"%(l["time"],l["t"].replace("_"," "),l["d"]) for l in data["log"]] or ["No activity yet today."]
    y=section(M,y,fw,"Activity today",lines=act)+14
    com="%s spent %d min screen free today and earned %d points.%s%s"%(data["name"],data["mins"],data["earned"]," %d points are waiting for your approval."%data["pending"] if data["pending"] else "",(" %d request%s waiting for a decision."%(len(data["open"]),"s are" if len(data["open"])>1 else " is")) if data["open"] else "")
    # wrap commentary
    from reportlab.lib.utils import simpleSplit
    lines=simpleSplit(com,"Helvetica",10,fw-28); lines=[l for l in lines]
    cwid=c.stringWidth("COMMENTARY","Helvetica-Bold",7.5)+10*.9+22
    c.setFillColor(C("chip")); c.roundRect(M,Y(y+19),cwid,19,2,fill=1,stroke=0); text(M+11,y+12.7,"COMMENTARY","Helvetica-Bold",7.5,"chipT",spc=.9)
    h=len(lines)*14+18; c.setFillColor(C("card")); c.setStrokeColor(C("line")); c.roundRect(M,Y(y+19+h),fw,h,6,fill=1,stroke=1)
    for i,l in enumerate(lines): text(M+14,y+19+16+i*14,l,"Helvetica",10,"ink")
    y=y+19+h+22
    c.setStrokeColor(C("line")); c.line(M,Y(y),W-M,Y(y))
    text(M,y+15,"Screen Free Rewards","Helvetica-Bold",8,"ink"); text(M+c.stringWidth("Screen Free Rewards","Helvetica-Bold",8)+4,y+15,"| v"+version,"Helvetica",8,"mut")
    text(M,y+27,"Sign in as a parent to approve points and decide requests.","Helvetica",8,"mut")
    text(W-M,y+15,d,"Helvetica",8,"mut","r"); text(W-M,y+27,"Test report" if test else "Daily report","Helvetica",8,"mut","r")
    c.showPage(); c.save()
if __name__=="__main__":
    data=json.load(open(sys.argv[1])); make(data,sys.argv[2],sys.argv[3],test=True)
