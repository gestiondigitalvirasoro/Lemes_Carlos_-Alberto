#!/usr/bin/env node
import fetch from 'node-fetch';

(async () => {
  try {
    const response = await fetch('http://localhost:3000/doctor/pacientes/13', {
      headers: {
        'User-Agent': 'Node.js/check-script'
      }
    });
    
    if (!response.ok) {
      console.error('❌ Response:', response.status, response.statusText);
      return;
    }
    
    const html = await response.text();
    
    // Buscar si los datos están en el HTML (en variables de JS)
    const hasAnamnesis = html.includes('motivo_consulta') || html.includes('anamnesis');
    const hasSignosVitales = html.includes('presion');
    const hasDiagnosticos = html.includes('diagnosticos');
    const hasAntecedentes = html.includes('antecedentes');
    const hasEstudios = html.includes('estudios') || html.includes('resultado');
    
    console.log('✅ Verificación de datos en HTML:\n');
    console.log('   Anamnesis/Motivo: ', hasAnamnesis ? '✓' : '✗');
    console.log('   Signos Vitales:   ', hasSignosVitales ? '✓' : '✗');
    console.log('   Diagnósticos:     ', hasDiagnosticos ? '✓' : '✗');
    console.log('   Antecedentes:     ', hasAntecedentes ? '✓' : '✗');
    console.log('   Estudios:         ', hasEstudios ? '✓' : '✗');

    // Intentar extraer JSON si existe
    const jsonMatch = html.match(/var\s+historialData\s*=\s*({.*?});/s) || 
                      html.match(/<script>\s*const\s+historia\s*=\s*({.*?});</s);
    
    if (jsonMatch) {
      console.log('\n📋 Datos encontrados en JavaScript');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
})();
