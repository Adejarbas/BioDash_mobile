/**
 * BioDash - Seeder de Usuário de Demonstração
 * Usuário: biogen@gmail.com
 *
 * Cria o usuário, perfil, 12 meses de indicadores,
 * manutenções, incidente ativo e alertas de sensor.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const pgPool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
});

// ==========================================
// Configurações do Usuário Demo
// ==========================================
const DEMO_EMAIL    = 'biogen@gmail.com';
const DEMO_PASSWORD = 'Biogen123!';

// ==========================================
// Dados de Perfil
// ==========================================
const DEMO_PROFILE = {
    name: 'Administrador BioDash',
    company: 'BioDash Demo',
    razao_social: 'Biogen Energia Renovável Ltda.',
    cnpj: '12345678000190',
    address: 'Rua das Bioenergias',
    numero: 42,
    city: 'São Paulo',
    state: 'SP',
    zip_code: '01310100',
    phone: '(11) 91234-5678',
    email: DEMO_EMAIL,
};

// ==========================================
// Indicadores — 12 meses retroativos
// ==========================================
function generateIndicators(userId) {
    const now = new Date();
    const rows = [];

    // Simula crescimento progressivo ao longo do ano
    const base = {
        waste:  4200,
        energy: 1900,
        tax:    3100,
    };
    const growth = { waste: 120, energy: 55, tax: 90 };
    const noise  = () => (Math.random() - 0.5) * 200;

    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
        const step = 11 - i;
        rows.push({
            user_id:          userId,
            waste_processed:  +(base.waste  + step * growth.waste  + noise()).toFixed(2),
            energy_generated: +(base.energy + step * growth.energy + noise()).toFixed(2),
            tax_savings:      +(base.tax    + step * growth.tax    + noise()).toFixed(2),
            measured_at:      d.toISOString(),
        });
    }
    return rows;
}

// ==========================================
// Manutenções
// ==========================================
function generateMaintenances(userId) {
    const now = new Date();
    const future = (days) => new Date(now.getTime() + days * 86400000).toISOString();
    const past   = (days) => new Date(now.getTime() - days * 86400000).toISOString();

    return [
        { user_id: userId, name: 'Inspeção do sistema de filtragem de biogás', priority: 'high',   status: 'pending', scheduled_date: future(3)  },
        { user_id: userId, name: 'Troca de manta filtrante do reator',          priority: 'medium', status: 'pending', scheduled_date: future(10) },
        { user_id: userId, name: 'Calibração dos sensores de temperatura',       priority: 'low',    status: 'pending', scheduled_date: future(18) },
        { user_id: userId, name: 'Verificação das válvulas de segurança',        priority: 'urgent', status: 'pending', scheduled_date: future(1)  },
        { user_id: userId, name: 'Limpeza do biodigestor principal',             priority: 'medium', status: 'done',    scheduled_date: past(5)    },
    ];
}

// ==========================================
// Alertas de Sensor
// ==========================================
function generateAlerts(userId) {
    const past = (h) => new Date(Date.now() - h * 3600000).toISOString();
    return [
        { user_id: userId, alert_level: 'info',    message: 'Sistema inicializado com sucesso. Monitoramento ativo.',         created_at: past(72) },
        { user_id: userId, alert_level: 'info',    message: 'Produção de biogás dentro do nível esperado (95%).',             created_at: past(48) },
        { user_id: userId, alert_level: 'aviso',   message: 'Temperatura do reator atingiu 38.5°C — monitoramento redobrado.',created_at: past(24) },
        { user_id: userId, alert_level: 'critico', message: 'Temperatura atingiu 41.2°C - Risco Crítico',                     created_at: past(6)  },
        { user_id: userId, alert_level: 'info',    message: 'Temperatura normalizada após resfriamento automático.',          created_at: past(5)  },
    ];
}

// ==========================================
// Marcadores de Mapa (MongoDB)
// ==========================================
const markerSchema = new mongoose.Schema({
    title: String, latitude: Number, longitude: Number,
    description: String, address: Object, createdAt: { type: Date, default: Date.now },
});
const Marker = mongoose.model('Marker', markerSchema);

const DEMO_MARKERS = [
    { title: 'Biodigestor Principal',   latitude: -23.5505, longitude: -46.6333, description: 'Unidade principal de tratamento - capacidade 50t/dia',        address: { cep: '01310100', street: 'Rua das Bioenergias', number: '42', complement: 'Galpão A' } },
    { title: 'Biodigestor Secundário',  latitude: -23.5530, longitude: -46.6290, description: 'Unidade secundária - em expansão',                           address: { cep: '01310100', street: 'Rua das Bioenergias', number: '55', complement: 'Galpão B' } },
    { title: 'Ponto de Coleta Leste',   latitude: -23.5480, longitude: -46.6200, description: 'Centro de coleta de resíduos orgânicos - Zona Leste',        address: { cep: '03001000', street: 'Av. Radial Leste',    number: '800', complement: '' } },
    { title: 'Ponto de Coleta Oeste',   latitude: -23.5580, longitude: -46.6500, description: 'Centro de coleta de resíduos orgânicos - Zona Oeste',        address: { cep: '05001000', street: 'Av. Brigadeiro Faria Lima', number: '1500', complement: '' } },
    { title: 'Estação de Distribuição', latitude: -23.5460, longitude: -46.6400, description: 'Distribuição de biogás processado para a rede local',        address: { cep: '01222010', street: 'Av. Paulista',        number: '900', complement: 'Sala 12' } },
];

// ==========================================
// Execução Principal
// ==========================================
async function seed() {
    console.log('\n🌱 Iniciando seeder de demonstração — BioDash\n');

    // --- 1. Criar / atualizar usuário ---
    const existing = await pgPool.query('SELECT id FROM users WHERE email = $1', [DEMO_EMAIL]);
    let userId;

    if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        console.log(`⚠️  Usuário ${DEMO_EMAIL} já existe. Reutilizando ID: ${userId}`);
        // Atualiza senha para garantir acesso
        const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
        await pgPool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
        console.log('🔑 Senha redefinida para:', DEMO_PASSWORD);
    } else {
        const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
        const res = await pgPool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
            [DEMO_EMAIL, hash]
        );
        userId = res.rows[0].id;
        console.log(`✅ Usuário criado: ${DEMO_EMAIL} (ID: ${userId})`);
    }

    // --- 2. Perfil ---
    await pgPool.query(
        `INSERT INTO user_profiles (user_id, name, company, razao_social, cnpj, address, numero, city, state, zip_code, phone, email, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           name=$2, company=$3, razao_social=$4, cnpj=$5, address=$6, numero=$7,
           city=$8, state=$9, zip_code=$10, phone=$11, email=$12, updated_at=NOW()`,
        [userId, DEMO_PROFILE.name, DEMO_PROFILE.company, DEMO_PROFILE.razao_social,
         DEMO_PROFILE.cnpj, DEMO_PROFILE.address, DEMO_PROFILE.numero,
         DEMO_PROFILE.city, DEMO_PROFILE.state, DEMO_PROFILE.zip_code,
         DEMO_PROFILE.phone, DEMO_PROFILE.email]
    );
    console.log('✅ Perfil criado/atualizado.');

    // --- 3. Indicadores — limpa os antigos e insere 12 meses ---
    await pgPool.query('DELETE FROM biodigester_indicators WHERE user_id = $1', [userId]);
    const indicators = generateIndicators(userId);
    for (const ind of indicators) {
        await pgPool.query(
            'INSERT INTO biodigester_indicators (user_id, waste_processed, energy_generated, tax_savings, measured_at) VALUES ($1,$2,$3,$4,$5)',
            [ind.user_id, ind.waste_processed, ind.energy_generated, ind.tax_savings, ind.measured_at]
        );
    }
    console.log(`✅ ${indicators.length} meses de indicadores inseridos.`);

    // --- 4. Manutenções ---
    await pgPool.query('DELETE FROM maintenance_schedules WHERE user_id = $1', [userId]);
    const maintenances = generateMaintenances(userId);
    for (const m of maintenances) {
        await pgPool.query(
            'INSERT INTO maintenance_schedules (user_id, name, priority, status, scheduled_date) VALUES ($1,$2,$3,$4,$5)',
            [m.user_id, m.name, m.priority, m.status, m.scheduled_date]
        );
    }
    console.log(`✅ ${maintenances.length} manutenções inseridas.`);

    // --- 5. Incidente ativo (últimas 24h) ---
    await pgPool.query('DELETE FROM maintenance_incidents WHERE user_id = $1', [userId]);
    await pgPool.query(
        'INSERT INTO maintenance_incidents (user_id, description, last_notification_at) VALUES ($1,$2,$3)',
        [userId, 'Pico de temperatura detectado no reator principal — aguardando normalização.', new Date(Date.now() - 3 * 3600000).toISOString()]
    );
    console.log('✅ Incidente de manutenção ativo inserido.');

    // --- 6. Alertas de Sensor ---
    await pgPool.query('DELETE FROM sensor_alerts WHERE user_id = $1', [userId]);
    const alerts = generateAlerts(userId);
    for (const a of alerts) {
        await pgPool.query(
            'INSERT INTO sensor_alerts (user_id, alert_level, message, created_at) VALUES ($1,$2,$3,$4)',
            [a.user_id, a.alert_level, a.message, a.created_at]
        );
    }
    console.log(`✅ ${alerts.length} alertas de sensor inseridos.`);

    // --- 7. Marcadores no MongoDB ---
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🟢 Conectado ao MongoDB.');
        await Marker.deleteMany({});
        await Marker.insertMany(DEMO_MARKERS);
        console.log(`✅ ${DEMO_MARKERS.length} marcadores de mapa inseridos.`);
        await mongoose.disconnect();
    } catch (err) {
        console.warn('⚠️  Não foi possível inserir marcadores no MongoDB:', err.message);
    }

    await pgPool.end();

    console.log('\n🎉 Seeder concluído com sucesso!');
    console.log('━'.repeat(45));
    console.log(`   Email:  ${DEMO_EMAIL}`);
    console.log(`   Senha:  ${DEMO_PASSWORD}`);
    console.log('━'.repeat(45));
    console.log('');
}

seed().catch((err) => {
    console.error('\n❌ Erro no seeder:', err.message);
    process.exit(1);
});
