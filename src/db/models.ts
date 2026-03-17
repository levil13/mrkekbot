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
    messageId: number;
    authorId: number;
    date: number;
    kekedUsers: number[];
}

export interface BannedMedia {
    fileId: string;
}

export interface Database {
    users: User[];
    messagesWithKek: MessageWithKek[];
    bannedMedia: BannedMedia[];
}
