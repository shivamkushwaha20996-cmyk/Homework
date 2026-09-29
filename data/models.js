export const MODEL_ORDER = ["A576","A376","A076","A075","A085","S741"];
export const RECORD_ORDER = ["A","B","C","D","E","F","G","H","I","J","K","L","N","P","Q","R","T","U","V"];

export const CATEGORIES = [
  { key:"all", label:"All", icon:"fa-layer-group" },
  { key:"Schematics", label:"Schematics", icon:"fa-diagram-project" },
  { key:"RF & Wireless", label:"RF & Antenna", icon:"fa-tower-broadcast" },
  { key:"Process & Tech", label:"Process & OPST", icon:"fa-gears" },
  { key:"Defect summary & SW process", label:"Defects & SW", icon:"fa-shield-halved" },
  { key:"Specification", label:"Specification", icon:"fa-clipboard-list" }
];

export const CATEGORY_COLORS = {
  "Schematics":"#2563eb",
  "RF & Wireless":"#059669",
  "Process & Tech":"#d97706",
  "Defect summary & SW process":"#4f46e5",
  "Specification":"#db2777"
};

const base = {
  A:{title:"Block Diagram",category:"Schematics",icon:"fa-sitemap",tags:["Block Diagram"],subItems:[
    {id:"ap-block-diagram",name:"AP Block Diagram",filename:"A576_AP_Block_Diagram.pdf",size:"25.0 MB"},
    {id:"rf-block-diagram",name:"RF Block Diagram",filename:"A576_RF_Block_Diagram.pdf",size:"25.1 MB"}]},
  B:{title:"Circuit Diagram",category:"Schematics",icon:"fa-diagram-project",tags:["Circuit Diagram"],subItems:[
    {id:"main-pba",name:"Main PBA",filename:"A576_Main_PBA_Schematic.pdf",size:"34.2 MB"},
    {id:"sub-pba",name:"Sub PBA",filename:"A576_Sub_PBA_Schematic.pdf",size:"34.3 MB"}]},
  C:{title:"SOC Table",category:"Schematics",icon:"fa-microchip",tags:["SOC Table"],filename:"A576_SOC_Pin_Table.xlsx",size:"28.3 MB"},
  D:{title:"MIPI Table",category:"Schematics",icon:"fa-bars-staggered",tags:["MIPI Configuration"],filename:"A576_MIPI_Config.xlsx",size:"12.7 MB"},
  E:{title:"RF Port Map",category:"RF & Wireless",icon:"fa-network-wired",tags:["RF Port Mapping"],filename:"A576_RF_Port_Mapping.pdf",size:"58.0 MB"},
  F:{title:"Antenna Structure",category:"RF & Wireless",icon:"fa-tower-broadcast",tags:["MIMO LTE NR 2G WCDMA"],filename:"A576_Antenna_3D_Layout.dwg",size:"84.2 MB"},
  G:{title:"Main and Roaming Bands Details",category:"RF & Wireless",icon:"fa-earth-americas",tags:["5G NR","LTE FDD/TDD","Global Bands"],filename:"A576_Bands_Master.xlsx",size:"9.2 MB"},
  H:{title:"VSWR Graph",category:"RF & Wireless",icon:"fa-chart-line",tags:["VSWR","Return Loss","S-Parameter"],filename:"VSWR_Graph.pdf",size:"RF graph"},
  I:{title:"TRP/TIS/SAR Offset Table",category:"RF & Wireless",icon:"fa-table-list",tags:["TRP","TIS","SAR","Offset","RF Performance"],filename:"A576_TRP_TIS_SAR_Offset_Table.xlsx",size:""},
  J:{title:"Process Flow Chart",category:"Process & Tech",icon:"fa-arrows-split-up-and-left",tags:["Workflow","Assembly Nodes"],subItems:[
    {name:"Sub Assembly",filename:"A576_Sub_Assembly_Flow.xlsx",size:"8.4 MB"},
    {name:"Main Line",filename:"A576_Main_Line_SOP.xlsx",size:"14.1 MB"}]},
  K:{title:"New Technology Introduced",category:"Process & Tech",icon:"fa-wand-magic-sparkles",tags:["Antenna Type","Graphite Layer","PMIC"],filename:"A576_New_Tech_Brief.pdf",size:"22.6 MB"},
  L:{title:"OPST Sheet",category:"Process & Tech",icon:"fa-clipboard-check",tags:["Open Short Test"],filename:"A576_OPST_Master.xlsx",size:"11.5 MB"},
  N:{title:"Base Model / LPR / Development Stage Defect Summary",category:"Defect summary & SW process",icon:"fa-bug",tags:["Base Model","LPR","Development Stage","RCA","Subsidiary Defects"],mergedSources:[
    {key:"N",name:"Base Model Defect History",icon:"fa-bug",filename:"A576_Base_Defects_RCA.xlsx",size:"31.2 MB",detail:"Predecessor failures + defect RCA"},
    {key:"O",name:"LPR / Development Stage Defect Summary",icon:"fa-triangle-exclamation",filename:"A576_Subsidiary_Defects.xlsx",size:"19.7 MB",detail:"Korea Office / SEVT / SEV development-stage defects"}
  ]},
  P:{title:"SW Log Process",category:"Defect summary & SW process",icon:"fa-terminal",tags:["Modem CP Dump","Kernel Panic","UART Guide"],filename:"A576_SW_Log_Guide.pdf",size:"17.4 MB"},
  Q:{title:"Basic Model Details",category:"Specification",icon:"fa-circle-info",tags:["Dimensions","Battery Spec"],filename:"A576_Basic_Spec.pdf",size:"12.4 MB"},
  R:{title:"Common and Exclusive Part Details",category:"Specification",icon:"fa-cubes",tags:["BOM Compare","Exclusive Part"],filename:"A576_Part_Matrix.xlsx",size:"15.8 MB"},
  T:{title:"Hardware Checklist",category:"Specification",icon:"fa-clipboard-check",tags:["Hardware verification","Pre-S sign-off"],filename:"",size:""},
  U:{title:"Korea Member Details",category:"Specification",icon:"fa-id-card",tags:["Korea Member Stage Wise"],filename:"A576_Korea_HQ_Roster.xlsx",size:"4.1 MB"},
  V:{title:"Common",category:"Specification",icon:"fa-folder-tree",tags:["ECN Notices","Engineering Archive"],filename:"A576_Common_Archive.zip",size:"95.0 MB"}
};

const meta = {
  A576:{name:"Galaxy A576",ap:"Exynos 1480",modem:"Sub6 -6GHz",status:"Mass Production",modelType:"Mass Production Model",leadKorea:"",swVersion:"A576XXU1AXB2",modelYear:"2026",sielHwPic:"",rfNetwork:"Sub6 -6GHz"},
  A376:{name:"Galaxy A376",ap:"Exynos 1380 (5nm)",modem:"Sub-6GHz / MIMO 4x4",status:"Development",modelType:"Development Model",leadKorea:"HQ R&D Team",swVersion:"A376XXU0AWA1",modelYear:"—",sielHwPic:"—",rfNetwork:"Sub-6GHz / MIMO 4x4"},
  A076:{name:"Galaxy A076",ap:"Mobile Platform",modem:"LTE / 5G",status:"Development",modelType:"Development Model",leadKorea:"HQ R&D Team",swVersion:"A076XXU0AWA1",modelYear:"—",sielHwPic:"—",rfNetwork:"LTE / 5G"},
  A075:{name:"Galaxy A075",ap:"Mobile Platform",modem:"LTE / 5G",status:"Development",modelType:"Development Model",leadKorea:"HQ R&D Team",swVersion:"A075XXU0AWA1",modelYear:"—",sielHwPic:"—",rfNetwork:"LTE / 5G"},
  A085:{name:"Galaxy A085",ap:"Mobile Platform",modem:"LTE / 5G",status:"Development",modelType:"Development Model",leadKorea:"HQ R&D Team",swVersion:"A085XXU0AWA1",modelYear:"—",sielHwPic:"—",rfNetwork:"LTE / 5G"},
  S741:{name:"Galaxy S741",ap:"Mobile Platform",modem:"Sub-6GHz / MIMO",status:"Development",modelType:"Development Model",leadKorea:"HQ R&D Team",swVersion:"S741XXU0AWA1",modelYear:"—",sielHwPic:"—",rfNetwork:"Sub-6GHz / MIMO"}
};

export function createDefaultData(){
  const out={};
  for(const model of MODEL_ORDER){
    const items=structuredClone(base);
    if(model!=="A576"){
      for(const item of Object.values(items)){
        if(item.filename) item.filename=item.filename.replaceAll("A576",model);
        item.subItems?.forEach(s=>s.filename=s.filename.replaceAll("A576",model));
        item.mergedSources?.forEach(s=>{if(s.filename)s.filename=s.filename.replaceAll("A576",model)});
      }
    }
    const fallback={name:`Galaxy ${model}`,ap:"—",modem:"—",status:"Development",modelType:"Development Model",leadKorea:"—",swVersion:"—",modelYear:"—",sielHwPic:"—",rfNetwork:"—"};
    out[model]={meta:{...fallback,...structuredClone(meta[model]||{})},items};
  }
  return out;
}
