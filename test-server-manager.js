// Test script for server manager functionality
import { getServerType, SERVER_TYPES, isCommandAllowed, getAvailableCommands } from './src/utils/serverManager.js';

console.log('Testing Server Manager...\n');

// Test server types
const testGuildIds = [
    '1317915330084995163', // Safe server
    '1234567890123456789', // Regular server
    '9876543210987654321'  // Another regular server
];

testGuildIds.forEach(guildId => {
    const serverType = getServerType(guildId);
    console.log(`Guild ${guildId}: ${serverType.toUpperCase()}`);
    
    const availableCommands = getAvailableCommands(serverType);
    console.log(`Available commands: ${availableCommands.join(', ')}`);
    
    // Test some command permissions
    const testCommands = ['gen', 'upload', 'serverinfo', 'gensettings'];
    testCommands.forEach(cmd => {
        const allowed = isCommandAllowed(cmd, guildId);
        console.log(`  ${cmd}: ${allowed ? '✅' : '❌'}`);
    });
    
    console.log('');
});

console.log('Test completed!');
