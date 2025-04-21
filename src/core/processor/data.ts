


// Example:
// 1. PlanContext
// create a plan
// update plan 
// activate plan
// deactivate plan
// resolve plan
// reject plan

import { z } from "zod";

const PlanDataSchema = z.object({
    id: z.string(),
    status: z.enum(["pending", "resolved", "rejected"]),
    steps: z.array(z.string()),
    result: z.string(),
});

const PlanActiveDataSchema = PlanDataSchema.extend({
    active: z.boolean(),
    memoryId: z.string(),
});

const PlanInactiveDataSchema = PlanActiveDataSchema.pick({
    id: true,
    status: true,
    memoryId: true,
    active: true,
});

type dealDataFn<Data,ActiveData,InactiveData> = (activeFn:(data:Data)=> ActiveData, inactiveFn:(data:Data)=> InactiveData) => void;
interface IRenderData<Data,ActiveData,InactiveData>{
    // storage: {active: ActiveData[];inactive: InactiveData[]};

    value: Data;
    dealData: dealDataFn<Data,ActiveData,InactiveData>;
    pushData(data:Data):void;
    checkData(data:Data):boolean;
    toActiveData():ActiveData;
    toInactiveData():InactiveData;
}

interface DataOp<T>{
    save():string;
    update(data:T):void;
    load(id:string):T;
    delete(id:string):void;
}



// 目前的问题是 同时抽象太多东西了，一个个抽象之后再进行组合呢？

// class Plan implements IData{

//     status: "resolved" | "rejected";
//     steps: string[];
//     result: any;

//     constructor(steps: string[]){
//         this.steps = steps;
//         this.status = "resolved";
//     }

//     async create<T>(content: T){
//         this.status = "resolved";
//         this.steps.push(content);
//     }

//     async resolve(result: any){
//         this.status = "resolved";
//         this.result = result;
//     }

//     async reject(reason: any){
//         this.status = "rejected";
//     }
// }

// interface DataResult{
//     create<T>(content: T): Promise<Plan>;
//     resolve(value: any): void;
//     reject(reason: any): void;
// }


// interface RenderData{
//     activeList: IData[];
//     inactiveList: IData[];

// }

// interface IData{
//     memoryId: string;
//     priority: number;
//     status: "inactive" | "active" | "resolved" | "rejected";
    

// }

// interface ToMemoryData{
//     memoryId: string;
//     save: () => string | Promise<string>;
//     load: (memoryId: string) => Promise<void>;
// }

// interface IDataProcessos{

// }
