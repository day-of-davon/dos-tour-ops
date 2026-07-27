import { useContext } from "react";
import { Ctx } from "../../context/DosContext";
import { BUS_DATA_MAP } from "../../lib/tour-data";
import { T } from "../../styles/tokens";
import { DayScheduleView } from "./DayScheduleView";
import { ROSTab } from "./ROSTab";

export function ScheduleTab(){
  const{shows,sel,tourDays,currentSplit,activeSplitParty}=useContext(Ctx);
  const show=shows[sel];
  const td=tourDays?.[sel];
  const isSynthetic=!show&&td&&(td.type==="off"||td.type==="travel"||td.type==="split");
  // On a split day with a real show: route by active party type.
  // Show party → ROS. Non-show party (advance, travel) → that party's day view.
  if(currentSplit&&show){
    if(!activeSplitParty||activeSplitParty.type==="show")return <ROSTab/>;
    return <DayScheduleView show={{type:activeSplitParty.type||"travel",city:activeSplitParty.location||"",venue:activeSplitParty.event||""}} bus={null} split={currentSplit} sel={sel}/>;
  }
  if(isSynthetic) return <DayScheduleView show={{type:td.type,notes:td.bus?.note}} bus={BUS_DATA_MAP[sel]||td?.bus||null} split={currentSplit||td?.split||null} sel={sel}/>;
  if(!show)return <div style={{padding:40,textAlign:"center",color:T.textDim,fontSize:11}}>No event scheduled for this date.</div>;
  return <ROSTab/>;
}
