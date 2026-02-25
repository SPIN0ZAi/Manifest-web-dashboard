import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
    discordId: string;
    username: string;
    avatar?: string;
    trackedAppIds: string[]; // Store AppIDs as strings to handle both numbers and strict strings
    role: 'user' | 'admin';
    accessStatus: 'unrequested' | 'pending' | 'approved' | 'rejected';
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        discordId: { type: String, required: true, unique: true },
        username: { type: String, required: true },
        avatar: { type: String },
        trackedAppIds: { type: [String], default: [] },
        role: { type: String, enum: ['user', 'admin'], default: 'user' },
        accessStatus: { type: String, enum: ['unrequested', 'pending', 'approved', 'rejected'], default: 'unrequested' },
    },
    { timestamps: true }
);

// Prevent mongoose from using stale schema during hot-reloads
if (process.env.NODE_ENV !== 'production' && mongoose.models.User) {
    delete mongoose.models.User;
}
export const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
