
export type Tone="red"|"rose"|"yellow"|"emerald";
export type Criterion={name:string;weight:number;selected:string;value:number;photos?:string[]};
export type GardenAssessment={id:string;name:string;project:string;district:string;score:number;lastEvaluation:string;criteria:Criterion[]};
export type ItemDef={label:string;max:number};
export type CriterionDef={name:string;weight:number;items:ItemDef[]};

export const criterionDefinitions:CriterionDef[]=[
{name:"تصنيف الحديقة",weight:15,items:[{label:"مساحة كبيرة أكبر من 5000 م²",max:15},{label:"مساحة متوسطة أكبر من 2500 م²",max:10},{label:"مساحة منخفضة أقل من 1500 م²",max:5}]},
{name:"البنية التحتية",weight:20,items:[{label:"خزان",max:5},{label:"شبكة ري",max:3},{label:"تربة زراعية",max:3},{label:"أشجار",max:4},{label:"عداد كهرباء",max:5}]},
{name:"وجود حدائق بالقرب من الموقع",weight:15,items:[{label:"بعيد عن الموقع 1000 م.ط",max:15},{label:"متوسط عن الموقع 800 م.ط",max:10},{label:"قريب عن الموقع 500 م.ط",max:5}]},
{name:"الأرصفة أو الممرات",weight:10,items:[{label:"متهالكة",max:3},{label:"متوسطة",max:7},{label:"جيدة",max:10}]},
{name:"الكثافة السكانية",weight:15,items:[{label:"عالية",max:15},{label:"متوسطة",max:10},{label:"منخفضة",max:5}]},
{name:"تكلفة أعمال التطوير والتحسين",weight:10,items:[{label:"عالية",max:3},{label:"متوسطة",max:7},{label:"منخفضة",max:10}]},
{name:"كثرة البلاغات والشكاوي",weight:15,items:[{label:"عالية",max:15},{label:"متوسطة",max:10},{label:"منخفضة",max:5}]}
];

export const samplePhotos=["https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80","https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80"];
export const demoGardens:GardenAssessment[]=[
{id:"demo-1",name:"حديقة الربيع",project:"مشروع بريمان وطيبة",district:"حي الربيع",score:94,lastEvaluation:"27 أبريل 2026",criteria:[
{name:"تصنيف الحديقة",weight:15,selected:"مساحة كبيرة أكبر من 5000 م²: 15",value:15,photos:samplePhotos},
{name:"البنية التحتية",weight:20,selected:"خزان:5 + شبكة ري:3 + أشجار:4 + عداد كهرباء:5",value:17,photos:samplePhotos},
{name:"وجود حدائق بالقرب من الموقع",weight:15,selected:"بعيد عن الموقع 1000 م.ط: 15",value:15},
{name:"الأرصفة أو الممرات",weight:10,selected:"متهالكة:3 + متوسطة:6",value:9,photos:samplePhotos},
{name:"الكثافة السكانية",weight:15,selected:"عالية:15",value:15},
{name:"تكلفة أعمال التطوير والتحسين",weight:10,selected:"منخفضة:8",value:8},
{name:"كثرة البلاغات والشكاوي",weight:15,selected:"عالية:15",value:15}]},
{id:"demo-2",name:"حديقة السلام",project:"مشروع الحمدانية",district:"حي السلام",score:69,lastEvaluation:"25 أبريل 2026",criteria:[
{name:"تصنيف الحديقة",weight:15,selected:"مساحة منخفضة أقل من 1500 م²:5",value:5},
{name:"البنية التحتية",weight:20,selected:"شبكة ري:3 + أشجار:4 + تربة زراعية:3",value:10,photos:samplePhotos},
{name:"وجود حدائق بالقرب من الموقع",weight:15,selected:"قريب عن الموقع 500 م.ط:5",value:5},
{name:"الأرصفة أو الممرات",weight:10,selected:"متوسطة:7",value:7},
{name:"الكثافة السكانية",weight:15,selected:"متوسطة:10",value:10},
{name:"تكلفة أعمال التطوير والتحسين",weight:10,selected:"عالية:3",value:3},
{name:"كثرة البلاغات والشكاوي",weight:15,selected:"عالية:15",value:15}]}
];
export function getPriority(score:number){if(score>=90)return{label:"قصوى",range:"90 - 100",tone:"red" as Tone,text:"تدخل عاجل"};if(score>=75)return{label:"عالية",range:"75 - 89",tone:"rose" as Tone,text:"صيانة قريبة"};if(score>=65)return{label:"متوسطة",range:"65 - 74",tone:"yellow" as Tone,text:"ضمن الخطة"};return{label:"منخفضة",range:"50 - 64",tone:"emerald" as Tone,text:"متابعة دورية"}}
export function getMainReasons(garden:GardenAssessment){return[...garden.criteria].sort((a,b)=>b.value-a.value).slice(0,3)}
