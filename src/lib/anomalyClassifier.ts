export type CriticalityLevel = 'info' | 'low' | 'medium' | 'critical';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ClassificationResult {
  isAnomaly: boolean;
  alertLevel: CriticalityLevel;
  suggestedPriority: MaintenancePriority;
  threshold: number;
  unit: string;
  label: string;
  description: string;
}

export interface BadgeStyleInfo {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconName: string;
  priorityLabel: string;
}

/**
 * Classifica a leitura de um sensor em 4 níveis hierárquicos:
 * - info: Operação normal
 * - low (aviso): Atenção operacional
 * - medium (alerta): Risco moderado / intervenção necessária
 * - critical: Risco crítico / intervenção urgente
 */
export function classifySensorReading(sensorType: string, value: number): ClassificationResult {
  const normType = (sensorType || '').toLowerCase().trim();
  const numValue = Number(value);

  // 1. TEMPERATURA (°C)
  if (normType.includes('temp') || normType === 'temperatura') {
    const unit = '°C';
    if (numValue > 40.0) {
      return {
        isAnomaly: true,
        alertLevel: 'critical',
        suggestedPriority: 'urgent',
        threshold: 40.0,
        unit,
        label: 'Crítico',
        description: `Temperatura perigosa de ${numValue.toFixed(1)}°C detectada. Risco imediato ao processo e pressão interna.`,
      };
    }
    if (numValue < 31.0) {
      return {
        isAnomaly: true,
        alertLevel: 'critical',
        suggestedPriority: 'urgent',
        threshold: 31.0,
        unit,
        label: 'Crítico',
        description: `Queda severa de temperatura (${numValue.toFixed(1)}°C). Risco de choque térmico das bactérias.`,
      };
    }
    if (numValue > 38.5) {
      return {
        isAnomaly: true,
        alertLevel: 'medium',
        suggestedPriority: 'high',
        threshold: 38.5,
        unit,
        label: 'Alerta Médio',
        description: `Temperatura acima do limite seguro (${numValue.toFixed(1)}°C). Recomenda-se acionar resfriamento.`,
      };
    }
    if (numValue < 33.0) {
      return {
        isAnomaly: true,
        alertLevel: 'medium',
        suggestedPriority: 'high',
        threshold: 33.0,
        unit,
        label: 'Alerta Médio',
        description: `Temperatura abaixo da faixa ideal (${numValue.toFixed(1)}°C). Verifique o isolamento térmico.`,
      };
    }
    if (numValue > 37.5 || numValue < 34.5) {
      return {
        isAnomaly: true,
        alertLevel: 'low',
        suggestedPriority: 'medium',
        threshold: numValue > 37.5 ? 37.5 : 34.5,
        unit,
        label: 'Atenção',
        description: `Temperatura em leve oscilação (${numValue.toFixed(1)}°C). Monitoramento preventivo.`,
      };
    }
    return {
      isAnomaly: false,
      alertLevel: 'info',
      suggestedPriority: 'low',
      threshold: 37.0,
      unit,
      label: 'Normal',
      description: `Temperatura operacional estável (${numValue.toFixed(1)}°C).`,
    };
  }

  // 2. PRESSÃO (bar)
  if (normType.includes('press') || normType === 'pressao') {
    const unit = 'bar';
    if (numValue > 1.90) {
      return {
        isAnomaly: true,
        alertLevel: 'critical',
        suggestedPriority: 'urgent',
        threshold: 1.90,
        unit,
        label: 'Crítico',
        description: `Sobrepressão crítica de ${numValue.toFixed(2)} bar. Risco grave de vazamento ou sobrecarga nas válvulas.`,
      };
    }
    if (numValue < 0.90) {
      return {
        isAnomaly: true,
        alertLevel: 'critical',
        suggestedPriority: 'urgent',
        threshold: 0.90,
        unit,
        label: 'Crítico',
        description: `Queda drástica de pressão (${numValue.toFixed(2)} bar). Suspeita de vazamento de biogás.`,
      };
    }
    if (numValue > 1.75) {
      return {
        isAnomaly: true,
        alertLevel: 'medium',
        suggestedPriority: 'high',
        threshold: 1.75,
        unit,
        label: 'Alerta Médio',
        description: `Pressão de biogás elevada (${numValue.toFixed(2)} bar). Aumente a vazão para consumo/gerador.`,
      };
    }
    if (numValue < 1.10) {
      return {
        isAnomaly: true,
        alertLevel: 'medium',
        suggestedPriority: 'high',
        threshold: 1.10,
        unit,
        label: 'Alerta Médio',
        description: `Pressão baixa (${numValue.toFixed(2)} bar). Verifique vedação e linha de biogás.`,
      };
    }
    if (numValue > 1.60 || numValue < 1.20) {
      return {
        isAnomaly: true,
        alertLevel: 'low',
        suggestedPriority: 'medium',
        threshold: numValue > 1.60 ? 1.60 : 1.20,
        unit,
        label: 'Atenção',
        description: `Pressão com oscilação moderada (${numValue.toFixed(2)} bar).`,
      };
    }
    return {
      isAnomaly: false,
      alertLevel: 'info',
      suggestedPriority: 'low',
      threshold: 1.50,
      unit,
      label: 'Normal',
      description: `Pressão operacional estável (${numValue.toFixed(2)} bar).`,
    };
  }

  // 3. pH
  if (normType === 'ph' || normType.includes('ph')) {
    const unit = 'pH';
    if (numValue < 6.2) {
      return {
        isAnomaly: true,
        alertLevel: 'critical',
        suggestedPriority: 'urgent',
        threshold: 6.2,
        unit,
        label: 'Crítico',
        description: `Acidificação severa (${numValue.toFixed(1)} pH). Risco de morte da flora bacteriana metanogênica.`,
      };
    }
    if (numValue > 8.0) {
      return {
        isAnomaly: true,
        alertLevel: 'critical',
        suggestedPriority: 'urgent',
        threshold: 8.0,
        unit,
        label: 'Crítico',
        description: `Alcalinização excessiva (${numValue.toFixed(1)} pH). Risco de toxicidade no reator.`,
      };
    }
    if (numValue < 6.5 || numValue > 7.7) {
      return {
        isAnomaly: true,
        alertLevel: 'medium',
        suggestedPriority: 'high',
        threshold: numValue < 6.5 ? 6.5 : 7.7,
        unit,
        label: 'Alerta Médio',
        description: `pH fora da faixa ótima (${numValue.toFixed(1)} pH). Ajuste a composição dos resíduos.`,
      };
    }
    if (numValue < 6.8 || numValue > 7.4) {
      return {
        isAnomaly: true,
        alertLevel: 'low',
        suggestedPriority: 'medium',
        threshold: numValue < 6.8 ? 6.8 : 7.4,
        unit,
        label: 'Atenção',
        description: `pH oscilando levemente (${numValue.toFixed(1)} pH). Faixa ideal: 6.8 a 7.4.`,
      };
    }
    return {
      isAnomaly: false,
      alertLevel: 'info',
      suggestedPriority: 'low',
      threshold: 7.1,
      unit,
      label: 'Normal',
      description: `pH equilibrado (${numValue.toFixed(1)} pH).`,
    };
  }

  // 4. H2S (ppm)
  if (normType.includes('h2s')) {
    const unit = 'ppm';
    if (numValue > 700) {
      return {
        isAnomaly: true,
        alertLevel: 'critical',
        suggestedPriority: 'urgent',
        threshold: 700,
        unit,
        label: 'Crítico',
        description: `Concentração tóxica e corrosiva de H2S (${numValue} ppm). Filtro saturado.`,
      };
    }
    if (numValue > 400) {
      return {
        isAnomaly: true,
        alertLevel: 'medium',
        suggestedPriority: 'high',
        threshold: 400,
        unit,
        label: 'Alerta Médio',
        description: `H2S elevado (${numValue} ppm). Filtro biológico requer regeneração.`,
      };
    }
    if (numValue > 200) {
      return {
        isAnomaly: true,
        alertLevel: 'low',
        suggestedPriority: 'medium',
        threshold: 200,
        unit,
        label: 'Atenção',
        description: `H2S moderado (${numValue} ppm). Acompanhe a desulfurização.`,
      };
    }
    return {
      isAnomaly: false,
      alertLevel: 'info',
      suggestedPriority: 'low',
      threshold: 150,
      unit,
      label: 'Normal',
      description: `H2S em níveis normais (${numValue} ppm).`,
    };
  }

  // Padrão
  return {
    isAnomaly: false,
    alertLevel: 'info',
    suggestedPriority: 'low',
    threshold: 0,
    unit: '',
    label: 'Informativo',
    description: `Leitura registrada: ${numValue}`,
  };
}

/**
 * Retorna as propriedades visuais padronizadas para cada nível de criticidade
 */
export function getCriticalityBadgeInfo(alertLevel: string): BadgeStyleInfo {
  const norm = (alertLevel || '').toLowerCase().trim();

  if (norm === 'critical' || norm === 'critico') {
    return {
      label: 'Crítico',
      color: '#dc2626',
      bgColor: '#fee2e2',
      borderColor: '#fca5a5',
      iconName: 'alert-octagon',
      priorityLabel: 'Manutenção Urgente',
    };
  }

  if (norm === 'medium' || norm === 'medio' || norm === 'alerta') {
    return {
      label: 'Alerta Médio',
      color: '#ea580c',
      bgColor: '#ffedd5',
      borderColor: '#fdba74',
      iconName: 'alert',
      priorityLabel: 'Manutenção Alta',
    };
  }

  if (norm === 'low' || norm === 'baixo' || norm === 'aviso') {
    return {
      label: 'Atenção',
      color: '#ca8a04',
      bgColor: '#fef9c3',
      borderColor: '#fde047',
      iconName: 'alert-circle-outline',
      priorityLabel: 'Manutenção Média',
    };
  }

  // info
  return {
    label: 'Normal',
    color: '#0284c7',
    bgColor: '#e0f2fe',
    borderColor: '#bae6fd',
    iconName: 'information-outline',
    priorityLabel: 'Baixa',
  };
}

/**
 * Retorna o ícone e nome amigável do sensor
 */
export function getSensorDisplayInfo(sensorType: string) {
  const norm = (sensorType || '').toLowerCase();

  if (norm.includes('temp')) {
    return {
      name: 'Sensor de Temperatura',
      icon: 'thermometer',
      tag: 'TMP',
      color: '#ef4444',
    };
  }

  if (norm.includes('press')) {
    return {
      name: 'Sensor de Pressão',
      icon: 'gauge',
      tag: 'PRS',
      color: '#3b82f6',
    };
  }

  if (norm.includes('ph')) {
    return {
      name: 'Sensor de pH',
      icon: 'water-percent',
      tag: 'PH',
      color: '#10b981',
    };
  }

  if (norm.includes('h2s')) {
    return {
      name: 'Sensor de H2S',
      icon: 'molecule',
      tag: 'H2S',
      color: '#8b5cf6',
    };
  }

  return {
    name: 'Sensor de Telemetria',
    icon: 'access-point',
    tag: 'SEN',
    color: '#6b7280',
  };
}
