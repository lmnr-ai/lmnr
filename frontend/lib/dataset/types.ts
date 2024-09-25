export interface Dataset {
    id: string;
    createdAt?: string;
    name: string;
    indexedOn: string | null;
}

export interface Datapoint {
    id: string;
    createdAt: string;
    data: Record<string, any>;
    target: Record<string, any>;
    indexedOn: string | null;
}
