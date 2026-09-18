require('dotenv').config();
const pgPool = require('./src/database/pg');

async function fix() {
  try {
    const userId = 'b73662a0-38c5-44a9-85ce-1c7420f96516';
    
    // Insere o perfil para esse usuário se não existir
    console.log('Tentando inserir perfil do usuário...');
    await pgPool.query('INSERT INTO user_profiles (user_id, name) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [userId, 'Usuário (Fix)']);
    console.log('Perfil garantido.');

    // Lê a constraint
    console.log('Checando restrições de chave estrangeira...');
    const res = await pgPool.query(`SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'biodigestor_maps' AND c.contype = 'f'`);
    console.log('Restrições encontradas:', res.rows);
    
    // Se a restrição apontar para user_profiles(id) em vez de user_profiles(user_id) ou users(id), nós ajustamos
    // Mas antes, vamos só ver se isso resolveu (só o fato de existir já resolve se for reference user_profiles(user_id))
  } catch (e) {
    console.error('Erro no script fix:', e);
  } finally {
    process.exit();
  }
}
fix();
