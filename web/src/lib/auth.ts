import DiscordProvider from 'next-auth/providers/discord';
import dbConnect from '@/lib/db/mongodb';
import { User } from '@/lib/db/models/User';

export const authOptions = {
    providers: [
        DiscordProvider({
            clientId: process.env.DISCORD_CLIENT_ID || '',
            clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
            // We just need identity to check the ID
            authorization: 'https://discord.com/api/oauth2/authorize?scope=identify',
        }),
    ],
    callbacks: {
        async signIn({ user, account, profile }: any) {
            if (account.provider === 'discord') {
                try {
                    await dbConnect();
                    const discordId = profile.id;
                    const isAdmin = discordId === '302125862340526120';

                    const updateFields: any = {
                        username: user.name,
                        avatar: user.image
                    };

                    if (isAdmin) {
                        updateFields.role = 'admin';
                        updateFields.accessStatus = 'approved';
                    }

                    await User.findOneAndUpdate(
                        { discordId },
                        {
                            $set: updateFields,
                            $setOnInsert: {
                                discordId,
                                role: isAdmin ? 'admin' : 'user',
                                accessStatus: isAdmin ? 'approved' : 'unrequested',
                                trackedAppIds: []
                            }
                        },
                        { upsert: true, new: true }
                    );
                } catch (error) {
                    console.error('Error saving user to DB:', error);
                }
            }
            return true;
        },
        async session({ session, token }: any) {
            if (session.user) {
                // Attach the user's Discord ID to the session object
                session.user.id = token.sub;

                try {
                    await dbConnect();
                    const dbUser = await User.findOne({ discordId: token.sub }).lean();
                    const isAdmin = token.sub === '302125862340526120';
                    console.log(`[NextAuth Session] Discord ID: ${token.sub}, DB User exists: ${!!dbUser}, DB Access Status: ${dbUser?.accessStatus}`);

                    if (dbUser) {
                        (session.user as any).role = isAdmin ? 'admin' : dbUser.role;
                        (session.user as any).accessStatus = isAdmin ? 'approved' : dbUser.accessStatus;
                        (session.user as any).trackedAppIds = dbUser.trackedAppIds || [];
                    } else if (isAdmin) {
                        (session.user as any).role = 'admin';
                        (session.user as any).accessStatus = 'approved';
                        (session.user as any).trackedAppIds = [];
                    }
                } catch (error) {
                    console.error('Error fetching user from DB:', error);
                    (session.user as any).trackedAppIds = [];
                }
            }
            return session;
        },
    },
};
