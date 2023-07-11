import { connect, disconnect, getSnapshot } from '../src/lib/db';

async function main() {
  try {
    // Connect to the Redis client
    await connect();

    // Get the snapshot of coins used as gas
    const snapshot = await getSnapshot();

    // Log the snapshot
    console.log('Coin Snapshot:');
    console.log(snapshot);

    // Disconnect from the Redis client
    await disconnect();
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

// Call the main function
main();
