import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  connectionString: 'postgresql://postgres.toxtaecvhkjzmkcdqnik:TaskOSDbPass2026%21%40%23@aws-0-ap-south-1.pooler.supabase.com:6543/postgres'
});

async function run() {
  await client.connect();
  console.log('Connected to DB');
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_auth (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
  `);
  
  console.log('Table whatsapp_auth created.');
  await client.end();
}

run().catch(console.error);
