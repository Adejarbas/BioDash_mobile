import {
    classifySensorReading,
    ClassificationResult,
} from './anomalyClassifier';
import { alertsApi, CreateAlertPayload, ApiResponse } from './api';

export interface TelemetryReadings {
    temperatura: number;
    pressao: number;
    ph: number;
    h2s: number;
}

export interface TelemetrySensorIdMap {
    temperatura: string;
    pressao: string;
    ph: string;
    h2s: string;
}

export const DEFAULT_SENSOR_IDS: TelemetrySensorIdMap = {
    temperatura: 'SN-TMP-01',
    pressao: 'SN-PRS-02',
    ph: 'SN-PH-01',
    h2s: 'SN-H2S-01',
};

const ALERT_RANK: Record<string, number> = {
    critical: 3,
    critico: 3,
    medium: 2,
    medio: 2,
    low: 1,
    aviso: 1,
    info: 0,
};

export interface EvaluatedTelemetry {
    classifications: {
        temperatura: ClassificationResult;
        pressao: ClassificationResult;
        ph: ClassificationResult;
        h2s: ClassificationResult;
    };
    highestAlert: (ClassificationResult & { sensorType: keyof TelemetryReadings; readingValue: number }) | null;
    isCritical: boolean;
    isMedium: boolean;
    isLow: boolean;
}

/**
 * Avalia um pacote de leituras IoT dos 4 sensores do biodigestor e identifica
 * a anomalia de maior severidade.
 */
export function evaluateTelemetryReadings(readings: TelemetryReadings): EvaluatedTelemetry {
    const tempClass = classifySensorReading('temperatura', readings.temperatura);
    const pressClass = classifySensorReading('pressao', readings.pressao);
    const phClass = classifySensorReading('ph', readings.ph);
    const h2sClass = classifySensorReading('h2s', readings.h2s);

    const entries: Array<ClassificationResult & { sensorType: keyof TelemetryReadings; readingValue: number }> = [
        { ...tempClass, sensorType: 'temperatura', readingValue: readings.temperatura },
        { ...pressClass, sensorType: 'pressao', readingValue: readings.pressao },
        { ...phClass, sensorType: 'ph', readingValue: readings.ph },
        { ...h2sClass, sensorType: 'h2s', readingValue: readings.h2s },
    ];

    entries.sort((a, b) => (ALERT_RANK[b.alertLevel] || 0) - (ALERT_RANK[a.alertLevel] || 0));
    const top = entries[0];

    return {
        classifications: {
            temperatura: tempClass,
            pressao: pressClass,
            ph: phClass,
            h2s: h2sClass,
        },
        highestAlert: top.isAnomaly ? top : null,
        isCritical: top.alertLevel === 'critical',
        isMedium: top.alertLevel === 'medium',
        isLow: top.alertLevel === 'low',
    };
}

/**
 * Constrói o payload padronizado de criação de alerta IoT para a API de alertas.
 */
export function buildSensorAlertPayload(
    sensorType: string,
    readingValue: number,
    anomalyInfo: { alertLevel: string; threshold: number; unit: string; description: string },
    activeBiodigester?: { id?: string | number | null; title?: string; name?: string } | null
): CreateAlertPayload {
    const norm = (sensorType || '').toLowerCase();
    const sensorId = norm.includes('temp')
        ? DEFAULT_SENSOR_IDS.temperatura
        : norm.includes('press')
        ? DEFAULT_SENSOR_IDS.pressao
        : norm.includes('ph')
        ? DEFAULT_SENSOR_IDS.ph
        : DEFAULT_SENSOR_IDS.h2s;

    const biodigesterId =
        activeBiodigester?.id !== undefined && activeBiodigester?.id !== null
            ? String(activeBiodigester.id)
            : null;

    return {
        biodigesterId,
        biodigesterName:
            activeBiodigester?.title || activeBiodigester?.name || 'Biodigestor Principal',
        sensorId,
        sensorType,
        readingValue: Number(Number(readingValue).toFixed(2)),
        thresholdValue: anomalyInfo.threshold,
        unit: anomalyInfo.unit,
        alertLevel: anomalyInfo.alertLevel,
        message: anomalyInfo.description,
        status: 'active',
    };
}

/**
 * Registra uma ocorrência de anomalia IoT respeitando a janela de deduplicação (cooldown)
 * por par (sensorType_alertLevel) e enviando para a API `/api/alerts`.
 */
export async function recordTelemetryOccurrence(params: {
    sensorType: string;
    readingValue: number;
    anomalyInfo: { alertLevel: string; threshold: number; unit: string; description: string };
    activeBiodigester?: { id?: string | number | null; title?: string; name?: string } | null;
    lastRecordedMap: Record<string, number>;
    cooldownMs?: number;
    now?: number;
    createAlertFn?: (payload: CreateAlertPayload) => Promise<ApiResponse<any>>;
}): Promise<{ recorded: boolean; skippedReason?: 'normal' | 'cooldown'; response?: ApiResponse<any> }> {
    const {
        sensorType,
        readingValue,
        anomalyInfo,
        activeBiodigester,
        lastRecordedMap,
        cooldownMs = 15000,
        now = Date.now(),
        createAlertFn = alertsApi.create,
    } = params;

    if (!anomalyInfo || anomalyInfo.alertLevel === 'info') {
        return { recorded: false, skippedReason: 'normal' };
    }

    const key = `${sensorType}_${anomalyInfo.alertLevel}`;
    if (lastRecordedMap[key] !== undefined && now - lastRecordedMap[key] < cooldownMs) {
        return { recorded: false, skippedReason: 'cooldown' };
    }

    lastRecordedMap[key] = now;
    const payload = buildSensorAlertPayload(sensorType, readingValue, anomalyInfo, activeBiodigester);
    const response = await createAlertFn(payload);
    return { recorded: response.success, response };
}
