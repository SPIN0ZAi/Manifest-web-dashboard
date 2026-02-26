import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IGame extends Document {
    id: string; // The URL slug or unique identifier (e.g., 'star-wars-outlaws')
    steamAppId?: string;
    title: string;
    status: 'cracked' | 'uncracked';
    releaseDate: string | Date;
    drm: string;
    image: string;
    cracker?: string;
    crackDate?: string | Date;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const GameSchema = new Schema<IGame>(
    {
        id: { type: String, required: true, unique: true },
        steamAppId: { type: String },
        title: { type: String, required: true },
        status: { type: String, enum: ['cracked', 'uncracked'], required: true },
        releaseDate: { type: String },
        drm: { type: String, default: 'Unknown' },
        image: { type: String },
        cracker: { type: String },
        crackDate: { type: String },
        notes: { type: String },
    },
    { timestamps: true }
);

// Prevent mongoose from using stale schema during hot-reloads
if (process.env.NODE_ENV !== 'production' && mongoose.models.Game) {
    delete mongoose.models.Game;
}

export const Game: Model<IGame> = mongoose.models.Game || mongoose.model<IGame>('Game', GameSchema);
