const express = require('express');
const supabase = require('../lib/supabase');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/indicators — Busca todos os indicadores do usuário (últimos 13 meses)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const since = new Date();
    since.setMonth(since.getMonth() - 13);

    const { data, error } = await supabase
      .from('biodigester_indicators')
      .select('*')
      .eq('user_id', req.user.id)
      .gte('measured_at', since.toISOString())
      .order('measured_at', { ascending: false });

    if (error) {
      console.error('Erro Supabase ao buscar indicadores:', error);
      return res.status(500).json({ success: false, message: 'Erro ao buscar indicadores.' });
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Erro ao buscar indicadores:', err);
    res.status(500).json({ success: false, message: 'Erro ao buscar indicadores.' });
  }
});

// POST /api/indicators — Cria ou atualiza (upsert por mês/ano)
router.post('/', authMiddleware, async (req, res) => {
  const { wasteProcessed, energyGenerated, taxSavings, month, year } = req.body;

  try {
    const monthIdx = parseInt(month);
    const yearVal = parseInt(year);
    const measuredAt = new Date(yearVal, monthIdx, 15).toISOString();
    const startDate = new Date(yearVal, monthIdx, 1).toISOString();
    const endDate = new Date(yearVal, monthIdx + 1, 0, 23, 59, 59).toISOString();

    // Verifica se já existe registro para este mês/ano
    const { data: existing, error: findError } = await supabase
      .from('biodigester_indicators')
      .select('id')
      .eq('user_id', req.user.id)
      .gte('measured_at', startDate)
      .lte('measured_at', endDate)
      .limit(1);

    if (findError) {
      console.error('Erro Supabase ao verificar indicador existente:', findError);
      return res.status(500).json({ success: false, message: 'Erro ao salvar indicador.' });
    }

    if (existing && existing.length > 0) {
      // Atualiza o registro existente
      const { error: updateError } = await supabase
        .from('biodigester_indicators')
        .update({
          waste_processed: wasteProcessed || 0,
          energy_generated: energyGenerated || 0,
          tax_savings: taxSavings || 0,
          measured_at: measuredAt,
        })
        .eq('id', existing[0].id);

      if (updateError) {
        console.error('Erro Supabase ao atualizar indicador:', updateError);
        return res.status(500).json({ success: false, message: 'Erro ao salvar indicador.' });
      }
    } else {
      // Insere novo registro
      const { error: insertError } = await supabase
        .from('biodigester_indicators')
        .insert({
          user_id: req.user.id,
          waste_processed: wasteProcessed || 0,
          energy_generated: energyGenerated || 0,
          tax_savings: taxSavings || 0,
          measured_at: measuredAt,
        });

      if (insertError) {
        console.error('Erro Supabase ao inserir indicador:', insertError);
        return res.status(500).json({ success: false, message: 'Erro ao salvar indicador.' });
      }
    }

    res.json({ success: true, message: 'Indicador salvo com sucesso.' });
  } catch (err) {
    console.error('Erro ao salvar indicador:', err);
    res.status(500).json({ success: false, message: 'Erro ao salvar indicador.' });
  }
});

module.exports = router;
