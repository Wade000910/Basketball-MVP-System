(function(root,factory){
    const api=factory(typeof module==='object'&&module.exports?require('../training/analysis-store.js'):root.TrainingAnalysis);
    if(typeof module==='object'&&module.exports)module.exports=api;
    else root.CoachCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Analysis){
    'use strict';
    const DAY=86400000;
    const DRILLS={free_throw:'罰球',mid_range:'中距離',three_point:'三分球'};
    const pct=(made,total)=>total?Math.round(made/total*1000)/10:null;
    const finished=s=>!!s.finishedAt && s.shots.length>0;
    function rate(sessions){
        const total=sessions.reduce((n,s)=>n+s.shots.length,0),made=sessions.reduce((n,s)=>n+s.shots.filter(x=>x.made).length,0);
        return {made,total,percentage:pct(made,total)};
    }
    // Weeks end today; index 0 is the oldest of `weeks` weeks.
    function weekly(sessions,now,weeks){
        return Array.from({length:weeks},(_,i)=>{
            const end=now.getTime()-(weeks-1-i)*7*DAY,start=end-7*DAY;
            return rate(sessions.filter(s=>{const t=Date.parse(s.startedAt);return t>start && t<=end;}));
        });
    }
    function motion(sessions){
        const pairs=sessions.filter(s=>s.drill==='free_throw' && s.analysisRuns?.length).flatMap(s=>Analysis.pair(s.shots,s.analysisRuns));
        return Analysis.pairedSummary(pairs);
    }
    // sessions: local-schema sessions each carrying userId. roster: [{user_id,display_name,role}].
    function teamReport(roster,sessions,now=new Date(),{weeks=4,inactiveDays=7}={}){
        const players=roster.filter(m=>m.role==='player').map(member=>{
            const own=sessions.filter(s=>s.userId===member.user_id && finished(s)).sort((a,b)=>Date.parse(a.startedAt)-Date.parse(b.startedAt));
            const recent=own.filter(s=>now-Date.parse(s.startedAt)<=7*DAY);
            const last=own.at(-1)?.startedAt || null;
            const daysSince=last===null?null:Math.floor((now-Date.parse(last))/DAY);
            const byDrill=Object.fromEntries(Object.keys(DRILLS).map(d=>[d,rate(own.filter(s=>s.drill===d))]));
            const trend=own.filter(s=>s.drill==='free_throw').slice(-10).map(s=>({startedAt:s.startedAt,...rate([s])}));
            return {userId:member.user_id,name:member.display_name,joinedAt:member.joined_at || null,
                sessions:own.length,sessions7:recent.length,shots7:recent.reduce((n,s)=>n+s.shots.length,0),
                lastPracticeAt:last,daysSince,inactive:daysSince===null || daysSince>=inactiveDays,
                overall:rate(own),byDrill,trend,weekly:weekly(own,now,weeks),motion:motion(own)};
        }).sort((a,b)=>b.shots7-a.shots7 || a.name.localeCompare(b.name,'zh-Hant'));
        const all=sessions.filter(s=>finished(s) && players.some(p=>p.userId===s.userId));
        const recent=all.filter(s=>now-Date.parse(s.startedAt)<=7*DAY);
        return {generatedAt:now.toISOString(),players,
            team:{players:players.length,active7:players.filter(p=>p.sessions7>0).length,
                sessions7:recent.length,shots7:recent.reduce((n,s)=>n+s.shots.length,0),
                byDrill:Object.fromEntries(Object.keys(DRILLS).map(d=>[d,rate(all.filter(s=>s.drill===d))])),
                weekly:weekly(all,now,weeks)},
            inactive:players.filter(p=>p.inactive).map(p=>({name:p.name,daysSince:p.daysSince}))};
    }

    // Deterministic synthetic team for demos and screenshots. Clearly labelled as such in the UI.
    function demoData(now=new Date()){
        let seed=20261103;const rand=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
        const people=[['demo-1','阿峻 #23',.78,6],['demo-2','小安 #7',.70,5],['demo-3','大熊 #34',.62,4],['demo-4','阿哲 #11',.66,3],['demo-5','Leo #3',.55,2],['demo-6','小飛 #9',.60,0]];
        const roster=[{user_id:'demo-coach',display_name:'教練',role:'coach'},...people.map(([id,name])=>({user_id:id,display_name:name,role:'player'}))];
        const sessions=[];
        for(const [id,,skill,perWeek] of people){
            const daysAgo=[];for(let w=0;w<4;w++)for(let k=0;k<perWeek;k++)daysAgo.push(w*7+Math.floor(rand()*7));
            if(!perWeek)daysAgo.push(16,20);
            daysAgo.sort((a,b)=>b-a).forEach((ago,n)=>{
                const drill=n%3===2?'three_point':n%3===1?'mid_range':'free_throw';
                const start=new Date(now.getTime()-ago*DAY-(18-n%3)*3600000);
                const improve=(28-ago)/28*.08,p=Math.min(.95,(drill==='free_throw'?skill:drill==='mid_range'?skill-.15:skill-.3)+improve);
                const shots=[],trials=[];
                for(let i=0;i<20;i++){
                    const t=start.getTime()+(i+1)*15000;
                    // Simulated motion timing: tighter around ~100 ms on makes, wider on misses.
                    const made=rand()<p;
                    shots.push({id:`${id}-${n}-${i}`,made,recordedAt:new Date(t+2500).toISOString()});
                    if(drill==='free_throw'){
                        const spread=made?25:55,dt=Math.round(100+(rand()+rand()+rand()-1.5)*2*spread);
                        trials.push({trialOrder:i+1,trialStatus:rand()<.9?'accepted':'low_quality',dt,timestamp:new Date(t).toISOString(),reasonCode:''});
                    }
                }
                for(const tr of trials)if(tr.trialStatus!=='accepted'){tr.dt=null;tr.reasonCode='LOW_VISIBILITY';}
                const session={schemaVersion:'basketball-training-v1',id:`${id}-s${n}`,userId:id,playerCode:id.toUpperCase().replace('-',''),targetShots:20,note:'',drill,
                    position:drill==='free_throw'?'center':['left','center','right'][n%3],inputSource:'manual',isDemo:false,
                    startedAt:start.toISOString(),finishedAt:new Date(start.getTime()+330000).toISOString(),shots};
                if(trials.length)session.analysisRuns=[{schemaVersion:Analysis.SCHEMA,id:`${id}-r${n}`,participantId:session.playerCode,sessionId:session.id,blockId:'B01',condition:'auditory',shootingSide:'right',startedAt:start.toISOString(),stoppedAt:session.finishedAt,trials}];
                sessions.push(session);
            });
        }
        return {team:{id:'demo-team',name:'示範球隊（合成資料）',invite_code:'DEMO2026',role:'coach'},roster,sessions};
    }
    return {DRILLS,teamReport,demoData};
});
