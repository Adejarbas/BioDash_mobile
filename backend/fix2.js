require('dotenv').config();
const pgPool = require('./src/database/pg');

async function fix() {
  try {
    console.log('Alterando a constraint de FK...');
    
    // Drop the wrong constraint
    await pgPool.query(`ALTER TABLE biodigestor_maps DROP CONSTRAINT biodigestor_maps_user_id_fkey;`);
    console.log('Constraint antiga deletada.');
    
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
