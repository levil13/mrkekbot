export interface User {
    id: number;
    name: string;
    kekNumber: number;
    lastKekGivenTo: LastKekGiven | null;
}

export interface LastKekGiven {
    userId: number;
    messageId: number;
}

export interface MessageWithKek {
    id: number;
    message_id?: number;
    date: number;
    from?: { id: number; is_bot?: boolean };
    fromId?: { userId: bigint };
    message?: string;
    text?: string;
    caption?: string;
    media?: unknown;
    kekedUsers: number[];
}

export interface Database {
    users: User[];
    messagesWithKek: MessageWithKek[];
}
