declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string);
    prepare(query: string): Statement;
    run(query: string, ...params: any[]): void;
    exec(query: string): void;
  }

  export interface Statement {
    run(...params: any[]): void;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }
}