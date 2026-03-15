import { DataSource } from 'typeorm';

async function checkColumns() {
    const ds = new DataSource({
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        username: 'postgres',
        password: 'Dat27102003',
        database: 'eng-center',
        synchronize: false,
    });
    await ds.initialize();
    const cols = await ds.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='class' ORDER BY ordinal_position`
    );
    console.log('ALL COLUMNS:');
    for (const c of cols) {
        console.log('  ' + c.column_name);
    }
    await ds.destroy();
}

checkColumns().catch(e => console.error('Error:', e.message));
