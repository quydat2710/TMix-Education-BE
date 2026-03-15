import { DataSource } from 'typeorm';
import { data } from './class-data';
import * as fs from 'fs';

async function fixEndTime() {
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

    // Step 1: Find the actual column names
    const cols = await ds.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='class' ORDER BY ordinal_position`
    );
    const colNames = cols.map((c: any) => c.column_name);
    fs.writeFileSync('columns.txt', colNames.join('\n'));
    console.log('Columns written to columns.txt');
    
    // Find end_time column
    const endTimeCol = colNames.find((n: string) => n.toLowerCase().includes('end_time'));
    const startTimeCol = colNames.find((n: string) => n.toLowerCase().includes('start_time'));
    console.log('start_time col:', startTimeCol);
    console.log('end_time col:', endTimeCol);
    
    if (!endTimeCol) {
        console.error('Could not find end_time column!');
        await ds.destroy();
        return;
    }

    // Step 2: Update end_time for each class
    for (const item of data) {
        await ds.query(
            `UPDATE "class" SET "${endTimeCol}" = $1 WHERE "name" = $2`,
            [item.schedule.time_slots.end_time, item.name]
        );
        console.log(`${item.name}: -> ${item.schedule.time_slots.end_time}`);
    }

    await ds.destroy();
    console.log('Done!');
}

fixEndTime().catch(e => console.error('Error:', e.message));
