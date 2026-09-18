require('dotenv').config();
const pgPool = require('./src/database/pg');

async function fix() {
  try {
    console.log('Limpando marcadores órfãos e recriando constraint...');
    
    // Delete orphaned rows
    const del = await pgPool.query(`DELETE FROM biodigestor_maps WHERE user_id NOT IN (SELECT id FROM users)`);
    console.log(`Marcadores órfãos deletados: ${del.rowCount}`);
    
    // Add the correct constraint
    await pgPool.query(`ALTER TABLE biodigestor_maps ADD CONSTRAINT biodigestor_maps_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;`);
    console.log('Nova constraint (users(id)) adicionada com sucesso!');
    
  } catch (e) {
    console.error('Erro:', e);
  } finally {
    process.exit();
  }
}
fix();
