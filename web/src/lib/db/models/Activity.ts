import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IActivity extends Document {
    actionType: 'search' | 'view' | 'download_manifest' | 'request_access';
    appId?: string;
    gameName?: string;
    discordId?: string;
    username?: string;
    metadata?: any;
    createdAt: Date;
    updatedAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
    {
        actionType: {
            type: String,
            enum: ['search', 'view', 'download_manifest', 'request_access'],
            required: true
        },
        appId: { type: String },
        gameName: { type: String },
        discordId: { type: String },
        username: { type: String },
        metadata: { type: Schema.Types.Mixed }
    },
    {
        timestamps: true,
        // Optional: Expiration for activity logs so the DB doesn't grow infinitely
        // expireAfterSeconds: 604800 // 7 days
    }
);

// Prevent mongoose from using stale schema during hot-reloads
if (process.env.NODE_ENV !== 'production' && mongoose.models.Activity) {
    delete mongoose.models.Activity;
}
export const Activity: Model<IActivity> = mongoose.models.Activity || mongoose.model<IActivity>('Activity', ActivitySchema);
