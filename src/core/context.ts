import { IContext, IContextManager } from "./interfaces";
import { z } from "zod";

export class ContextManager implements IContextManager {
    id: string;
    name: string;
    description: string;
    data: any;
    contexts: IContext<any, any>[];

    constructor(id: string, name: string, description: string, data: any) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.data = data;
        this.contexts = [];
    }

    registerContext<T extends z.ZodObject<any>, M extends z.ZodObject<any>>(context: IContext<T, M>): void {
        this.contexts.push(context);
    }
    
    findContextById(id: string): IContext<any, any> {
        return this.contexts.find((context) => context.id === id) as IContext<any, any>;
    }

    renderPrompt(): string {
        return `
            ${this.contexts.map((context) => context.renderPrompt()).join("\n")}
        `;
    }

    contexList(): IContext<any, any>[] {
        return this.contexts;
    }
}

