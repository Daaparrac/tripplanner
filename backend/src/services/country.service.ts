import { Country } from '../models/Country.model';
import countryCodesJson from '../data/countryCodes.json';

/**
 * Siembra la tabla de países con los datos de FlagCDN si está vacía.
 * Obtiene los datos en vivo desde https://flagcdn.com/en/codes.json con fallback local.
 */
export async function seedCountries(): Promise<void> {
  try {
    const count = await Country.count();
    if (count > 0) {
      return;
    }

    console.log('🌱 Sembrando tabla de países (FlagCDN)...');
    let data: Record<string, string> = countryCodesJson;

    try {
      const response = await fetch('https://flagcdn.com/en/codes.json', { signal: AbortSignal.timeout(4000) });
      if (response.ok) {
        data = (await response.json()) as Record<string, string>;
      }
    } catch {
      console.log('⚠️ No se pudo conectar a flagcdn.com, usando copia local en caché.');
    }

    const rows = Object.entries(data).map(([code, name]) => ({
      code: code.toLowerCase(),
      name,
    }));

    await Country.bulkCreate(rows, { ignoreDuplicates: true });
    console.log(`✅ ${rows.length} países sembrados exitosamente en la base de datos.`);
  } catch (err) {
    console.error('❌ Error sembrando países:', err);
  }
}
