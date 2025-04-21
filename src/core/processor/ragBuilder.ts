// --- RAG Builder ---
// First, we need to formalize the behavior of the RAG Builder.
// The RAG Builder is responsible for building a RAG from a given context.
// The RAG Builder will be responsible for extracting the relevant information from the context
// and building a RAG from it.
// The RAG Builder will be responsible for storing the RAG in the context.
// The RAG Builder will be responsible for returning the RAG from the context.

import { IMemoryManager } from "../interfaces";

// Try to formalize IContext Data behavior
// 1. First, the motivation is we can't render all the data into the context
// 2. so we need to distinguish the data into two parts:
//   1. the data that can be rendered into the context
//   2. the data that can't be rendered into the context
// 3. how to convert these two parts of data into each other

// IHotData respresents the data that can be rendered into the context
// IColdData respresents the data that can't be rendered into the context
// IDataManager is the manager of the data
//   it has the the IHotdataList to manager the IHotData list
//   it has the the IColdDataList to manager the IColdData list
//   the importmant ability is to convert the ColdData to HotData and vice versa
//   we need to notice we store the content of the ColdData in the memory, so we need to provide the memoryId to the IDataManager
interface IDataManager<HotData extends IHotData<any>, ColdData extends IColdData<any>> {
    memoryManager: IMemoryManager;
    toHotData(data: ColdData): HotData;
    toColdData(data: HotData): ColdData;

    addData(data: HotData): void;
    // 1. the free of the active list
    // 2. push into the active list
    // 3. save the memory

    // 1. save the memory 
    // 2. extract the info and push into the inactive list
    update: (data: HotData) => void;
    activeList: () => HotData[];
    inactiveList: () => ColdData[];
}

interface IHotData<ColdData>{
    id: string;
    extractInfo():ColdData;
}

interface IColdData<HotData extends IHotData<any>>{
    id: string;
    memoryId: string;
    loadHotData():HotData;
    saveHotData(hotData: HotData):void;
}

// class BaseDataManager<HotData extends {id: string}, ColdData extends {id: string, memoryId: string}> implements DataManager<HotData, ColdData> {
//     memoryManager: IMemoryManager;
//     containerId: string;
//     constructor(memoryManager: IMemoryManager, containerId: string){
//         this.memoryManager = memoryManager;
//         this.containerId = containerId;
//     }

//     toHotData(data: ColdData): HotData{
//         return this.memoryManager.loadMemory(data.memoryId, this.containerId);
//     }
//     toColdData(data: HotData): ColdData{
//         return this.memoryManager.loadMemory(data.memoryId, this.containerId);
//     }
    
    
// }

interface RagBuilder<T> {
    datas: toRagData<T>[];

    addData: (data: toRagData<T>) => void;
    removeData: (data: toRagData<T>) => void;
    updateData: (data: toRagData<T>) => void;
    getRagData: () => RAGData<T>[];
}


interface toRagData<T> {
    toRagData: () => RAGData<T>;
}

type RAGData<T> = {
    id: string;
    vector: number[];
    summary: string;
    content: T;
    summaryFn: (content: T) => string;
}