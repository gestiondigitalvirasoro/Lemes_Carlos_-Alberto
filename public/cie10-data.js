// Códigos CIE-10 más comunes en Argentina
const CIE10_DIAGNOSTICOS = [
  // Enfermedades del sistema circulatorio
  { codigo: 'I10', descripcion: 'Hipertensión esencial (primaria)' },
  { codigo: 'I11', descripcion: 'Cardiopatía hipertensiva' },
  { codigo: 'I20', descripcion: 'Angina de pecho' },
  { codigo: 'I21', descripcion: 'Infarto agudo del miocardio' },
  { codigo: 'I50', descripcion: 'Insuficiencia cardíaca' },
  { codigo: 'I69', descripcion: 'Secuelas de enfermedad cerebrovascular' },
  
  // Diabetes
  { codigo: 'E10', descripcion: 'Diabetes mellitus tipo 1' },
  { codigo: 'E11', descripcion: 'Diabetes mellitus tipo 2' },
  { codigo: 'E14', descripcion: 'Diabetes mellitus no especificada' },
  
  // Enfermedades respiratorias
  { codigo: 'J00', descripcion: 'Rinofaringitis aguda' },
  { codigo: 'J06', descripcion: 'Infección aguda de las vías respiratorias superiores' },
  { codigo: 'J20', descripcion: 'Bronquitis aguda' },
  { codigo: 'J44', descripcion: 'Enfermedad pulmonar obstructiva crónica' },
  { codigo: 'J45', descripcion: 'Asma' },
  
  // Infecciones
  { codigo: 'A00', descripcion: 'Cólera' },
  { codigo: 'A09', descripcion: 'Diarrea y gastroenteritis de origen infeccioso' },
  { codigo: 'B34', descripcion: 'Infección viral sin especificar' },
  
  // Enfermedades endocrinas
  { codigo: 'E00', descripcion: 'Síndrome congénito de deficiencia de yodo' },
  { codigo: 'E05', descripcion: 'Tirotoxicosis' },
  { codigo: 'E06', descripcion: 'Tiroiditis' },
  
  // Enfermedades del aparato digestivo
  { codigo: 'K21', descripcion: 'Reflujo gastroesofágico' },
  { codigo: 'K25', descripcion: 'Úlcera gástrica' },
  { codigo: 'K26', descripcion: 'Úlcera duodenal' },
  { codigo: 'K29', descripcion: 'Gastritis y duodenitis' },
  { codigo: 'K30', descripcion: 'Dispepsia' },
  
  // Enfermedades genitourinarias
  { codigo: 'N18', descripcion: 'Enfermedad renal crónica' },
  { codigo: 'N39', descripcion: 'Otros trastornos del sistema urinario' },
  
  // Enfermedades musculoesqueléticas
  { codigo: 'M16', descripcion: 'Artrosis primaria de cadera' },
  { codigo: 'M17', descripcion: 'Artrosis primaria de rodilla' },
  { codigo: 'M19', descripcion: 'Otras artrosis' },
  { codigo: 'M45', descripcion: 'Espondilitis anquilosante' },
  { codigo: 'M79', descripcion: 'Otros trastornos de los tejidos blandos' },
  
  // Enfermedades mentales
  { codigo: 'F32', descripcion: 'Episodio depresivo' },
  { codigo: 'F41', descripcion: 'Trastornos de ansiedad' },
  { codigo: 'F43', descripcion: 'Reacción al estrés grave y trastorno de adaptación' },
  
  // Enfermedades del sistema nervioso
  { codigo: 'G30', descripcion: 'Enfermedad de Alzheimer' },
  { codigo: 'G40', descripcion: 'Epilepsia' },
  { codigo: 'G89', descripcion: 'Dolor no clasificado en otra parte' },
  
  // Problemas de salud relacionados con el comportamiento
  { codigo: 'Z72', descripcion: 'Problemas relacionados con el estilo de vida' },
  { codigo: 'Z73', descripcion: 'Problemas relacionados con dificultades de control' },
  
  // Otros diagnósticos comunes
  { codigo: 'S00', descripcion: 'Traumatismo superficial de la cabeza' },
  { codigo: 'T88', descripcion: 'Complicaciones de la asistencia médica y quirúrgica' },
  { codigo: 'Z00', descripcion: 'Examen y consulta por razones de salud' },
];

function buscarCIE10(termino) {
  if (!termino || termino.length < 2) return [];
  
  const lowerTermino = termino.toLowerCase();
  return CIE10_DIAGNOSTICOS.filter(d => 
    d.codigo.toLowerCase().includes(lowerTermino) || 
    d.descripcion.toLowerCase().includes(lowerTermino)
  ).slice(0, 20); // Limitar a 20 resultados
}
