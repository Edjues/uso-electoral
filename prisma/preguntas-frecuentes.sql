-- Preguntas frecuentes de la Mesa de Atención — elección del representante de los egresados
-- ante el Consejo Superior Universitario (Universidad de Córdoba, jornada del 12 de noviembre de 2026).
--
-- Cómo usarlo: Supabase → SQL Editor → pegar todo este archivo → Run.
-- (o desde la carpeta del proyecto:  npx prisma db execute --file prisma/preguntas-frecuentes.sql --schema prisma/schema.prisma)
--
-- Se puede ejecutar varias veces: no duplica una pregunta que ya exista con el mismo texto.
-- Las llamadas guardan la solicitud como texto, así que agregar o quitar preguntas no altera llamadas ya registradas.

BEGIN;

-- OPCIONAL: quitar las solicitudes de ejemplo que venían con la aplicación (deja "Otra solicitud").
-- Quite los dos guiones del inicio de la línea siguiente si quiere borrarlas.
-- DELETE FROM public.respuestas WHERE pregunta <> 'Otra solicitud';

INSERT INTO public.respuestas (pregunta, respuesta, resolucion)
SELECT v.pregunta, v.respuesta, v.resolucion
FROM (VALUES

-- 1
($$¿Estoy incluido en el censo para votar?$$,
$$Para verificar si se encuentra habilitado para votar, puede consultar el censo electoral en la página web oficial de la Universidad de Córdoba (www.unicordoba.edu.co), ingresando su número de documento. De acuerdo con el artículo 12 del Acuerdo 096, únicamente pueden ejercer el derecho al voto los egresados incluidos en el censo electoral definitivo, cuya información es la misma que se encuentra cargada en el sistema de votación.
Es importante precisar que, conforme al artículo 5 del Acuerdo 097, el plazo para solicitar inclusiones venció el 28 de octubre de 2026, por lo que no es posible tramitar nuevas solicitudes. El censo electoral definitivo fue publicado el 10 de noviembre de 2026.$$,
$$Orientar la consulta del censo en www.unicordoba.edu.co con el número de documento. No se tramitan inclusiones (plazo vencido el 28 de octubre de 2026). Base: Acuerdo 096, art. 12; Acuerdo 097, art. 5.$$),

-- 2
($$Me dice que mis credenciales son incorrectas. ¿Qué hago?$$,
$$Le recomendamos tener a la mano el número del acta de grado y la fecha de grado correspondientes al último programa académico del cual obtuvo su título en la Universidad de Córdoba. Recuerde que, de conformidad con el artículo 15, parágrafo primero, del Acuerdo 096, los egresados que hayan obtenido varios títulos en la Universidad solo podrán ejercer su derecho al voto una vez, por lo que el sistema valida las credenciales correspondientes al último título obtenido.
Si después de verificar esta información persiste el inconveniente, procederemos a orientarlo de acuerdo con el protocolo establecido para estos casos.$$,
$$Verificar que use el acta y la fecha de grado del último título. Si persiste, aplicar el protocolo de validación de identidad (ver "No recuerdo mi fecha de grado o el número de acta"). Base: Acuerdo 096, art. 15, parágrafo 1.$$),

-- 3
($$No recuerdo mi fecha de grado o el número de acta. ¿Cómo voto?$$,
$$Con gusto podemos ayudarle a consultar la fecha de grado y el número del acta. Para ello, previamente debemos verificar su identidad. Le solicitamos suministrar su número de documento, nombre completo, programa académico del cual se graduó y año de grado o lugar de expedición de su documento de identidad.
Esta validación se realiza de conformidad con los artículos 22 y 23 del Acuerdo 096, que establecen los mecanismos de identificación del votante y la asistencia de la Mesa para verificar su condición de elector.
Una vez confirmada su identidad, consultaremos las bases de datos institucionales y le suministraremos la información necesaria para ingresar a la plataforma de votación. En caso de no ser posible validar su identidad, no podremos proporcionar los datos solicitados y se dejará constancia de la atención.$$,
$$Validar identidad (documento, nombre completo, programa y año de grado o lugar de expedición del documento) y consultar las bases institucionales. Si no se puede validar: no entregar datos y dejar constancia en la observación. Base: Acuerdo 096, arts. 22 y 23.$$),

-- 4
($$Mis datos no coinciden con los del sistema. ¿Qué pasa?$$,
$$Una vez verificada su identidad, procederemos a indicarle cómo aparecen registrados sus datos en el censo electoral, para que intente ingresar utilizando exactamente esa información. Si la inconsistencia persiste, deberá registrar su caso para remitirlo al Comité Electoral, instancia competente para resolver los inconvenientes y reclamaciones que se presenten durante el proceso, de conformidad con el artículo 9, literales c y e, del Acuerdo 096.
Es importante precisar que, conforme al parágrafo del artículo 12 del mismo Acuerdo, una vez cargado el censo electoral, no es posible modificar la base de datos ni la configuración de la plataforma durante la jornada de votación. Por tanto, la Mesa no está facultada para realizar modificaciones en sus datos.$$,
$$Validar identidad e informar cómo aparecen sus datos en el censo. Si persiste: dejar el caso PENDIENTE y remitirlo al Comité Electoral. La Mesa no modifica datos. Base: Acuerdo 096, art. 9 lit. c y e; art. 12, parágrafo.$$),

-- 5
($$El sistema no valida mi imagen. ¿Qué debo hacer?$$,
$$Para ingresar a la plataforma de votación, el artículo 22 del Acuerdo 096 establece un mecanismo de autenticación digital para verificar la identidad del votante. Por ello, le recomendamos utilizar un dispositivo con cámara, ubicarse en un lugar bien iluminado y asegurarse de que tanto su rostro como su documento de identidad sean claramente visibles. Evite utilizar gorras, gafas o cualquier elemento que obstruya la identificación. Verifique que la imagen esté nítida, enfocada y centrada antes de realizar nuevamente el proceso de validación.$$,
$$Recomendar buena iluminación, rostro y documento visibles, sin gorra ni gafas, imagen nítida y centrada; reintentar. Base: Acuerdo 096, art. 22.$$),

-- 6
($$Entro con mi documento y dice que ya voté. ¿Qué hago?$$,
$$De acuerdo con el artículo 1 del Acuerdo 096, el voto es personal, secreto, libre e indelegable y solo puede ejercerse una vez. En este caso, procederemos a registrar su solicitud y remitirla al Comité Electoral, instancia competente para atender las reclamaciones que se presenten durante el proceso, conforme al artículo 9, literal e, del mismo Acuerdo.
Es importante precisar que la Mesa no tiene acceso a la información que permita conocer el sentido del voto ni está facultada para consultar o revelar la opción seleccionada, en garantía del principio de secreto del voto, conforme al parágrafo del artículo 23. Asimismo, le recomendamos mantener la confidencialidad de sus credenciales y evitar compartirlas con terceros.$$,
$$Registrar el caso como PENDIENTE y remitirlo al Comité Electoral. No consultar ni revelar el sentido del voto. Base: Acuerdo 096, art. 1; art. 9 lit. e; art. 23, parágrafo.$$),

-- 7
($$El sistema se bloqueó por varios intentos. ¿Qué hago?$$,
$$Por razones de seguridad, la plataforma puede bloquear temporalmente el acceso cuando se registran varios intentos consecutivos de ingreso con un mismo documento. Este mecanismo hace parte de los protocolos de seguridad de la información contemplados en el artículo 14 del Acuerdo 096.
Le recomendamos esperar aproximadamente 10 minutos antes de realizar un nuevo intento, verificando previamente que los datos de acceso sean correctos y evitando realizar múltiples intentos consecutivos.$$,
$$Indicar que espere unos 10 minutos y verifique sus datos antes de reintentar. Base: Acuerdo 096, art. 14.$$),

-- 8
($$El enlace para votar no funciona o no abre.$$,
$$De conformidad con el artículo 22 del Acuerdo 096, la votación puede realizarse desde cualquier computador o dispositivo móvil con conexión a internet, siempre que cumpla con los requisitos técnicos establecidos.
Le recomendamos verificar que cuenta con una conexión estable a internet. Si está utilizando datos móviles y presenta baja señal, intente conectarse a una red wifi o cambiar de ubicación. Asimismo, ingrese al enlace oficial de votación a través de la página web de la Universidad de Córdoba e intente acceder utilizando otro navegador.
Por parte de la Mesa de Atención Técnica, se ha verificado que el sistema de votación y sus servidores se encuentran operando con normalidad.$$,
$$Verificar conexión (wifi o mejor señal), entrar por el enlace oficial desde la página de la Universidad y probar otro navegador. Base: Acuerdo 096, art. 22.$$),

-- 9
($$La plataforma está caída.$$,
$$En este momento, el equipo técnico se encuentra verificando la situación reportada para determinar las posibles causas de la dificultad. De conformidad con el artículo 14 del Acuerdo 096, la plataforma cuenta con protocolos de seguridad de la información que pueden generar restricciones temporales de acceso.
Le recomendamos intentar ingresar nuevamente en aproximadamente cinco minutos. Recuerde que la jornada de votación estará habilitada desde las 7:00 a. m. hasta las 5:00 p. m., por lo que podrá ejercer su derecho al voto en cualquier momento dentro de este horario.$$,
$$Reportar al equipo técnico y pedir que reintente en unos 5 minutos. Recordar el horario (7:00 a. m. a 5:00 p. m.). Base: Acuerdo 096, art. 14.$$),

-- 10
($$Intento votar, pero la cámara de mi dispositivo no funciona.$$,
$$De conformidad con el artículo 22 del Acuerdo 096, el proceso de votación requiere un mecanismo de autenticación digital para verificar la identidad del votante, el cual incluye la captura de una imagen de su rostro junto con su documento de identidad. Por tanto, es necesario utilizar un dispositivo que cuente con una cámara funcional.
Le recomendamos verificar que el navegador tenga habilitados los permisos de acceso a la cámara. Si el inconveniente persiste, puede intentar realizar el proceso desde otro computador o dispositivo móvil que disponga de cámara.$$,
$$Revisar permisos de cámara del navegador; si persiste, usar otro dispositivo con cámara. Base: Acuerdo 096, art. 22.$$),

-- 11
($$¿Cuál es el horario de votación?$$,
$$La jornada de votación electrónica se llevará a cabo el día 12 de noviembre de 2026, en horario continuo de 7:00 a. m. a 5:00 p. m., hora de Colombia, de conformidad con el cronograma establecido en el artículo 3 del Acuerdo 097. Es importante tener en cuenta que, una vez sean las 5:00 p. m., la plataforma cerrará y no será posible emitir el voto.$$,
$$Informar: 12 de noviembre de 2026, de 7:00 a. m. a 5:00 p. m. (hora de Colombia). Base: Acuerdo 097, art. 3.$$),

-- 12
($$¿Quiénes son los aspirantes?$$,
$$El listado definitivo de aspirantes habilitados se encuentra publicado desde el 4 de noviembre de 2026 en la página web oficial de la Universidad de Córdoba, conforme al cronograma establecido en el Acuerdo 097. Asimismo, una vez complete el proceso de autenticación, podrá consultar en el tarjetón electrónico las fórmulas de candidatos (principal y suplente), identificadas con su respectivo número, nombres completos y fotografía, de acuerdo con lo establecido en el artículo 19 del Acuerdo 096.$$,
$$Remitir al listado publicado en la página web de la Universidad (desde el 4 de noviembre de 2026) y al tarjetón electrónico. Base: Acuerdo 097; Acuerdo 096, art. 19.$$),

-- 13
($$¿Cómo voto?$$,
$$Para ejercer su derecho al voto, debe ingresar a la plataforma de votación electrónica y seguir el procedimiento de autenticación, que incluye la validación de su documento de identidad, número de acta, fecha de grado y la captura de la imagen de su rostro junto con su documento de identidad. Una vez validada su identidad, podrá visualizar el tarjetón electrónico, seleccionar la fórmula de su preferencia y confirmar su voto, de conformidad con los artículos 19 y 22 del Acuerdo 096.
La Universidad dispone de un instructivo y un video explicativo con el paso a paso del procedimiento, los cuales puede consultar en la página web institucional.$$,
$$Explicar el paso a paso y remitir al instructivo y al video de la página web institucional. Base: Acuerdo 096, arts. 19 y 22.$$),

-- 14
($$¿Cuándo se publican los resultados?$$,
$$Los resultados de la jornada electoral se publicarán el 12 de noviembre de 2026 en la página web oficial de la Universidad de Córdoba, conforme al cronograma establecido en el Acuerdo 097.
Una vez finalizada la votación, se generará el boletín final de resultados, de acuerdo con el artículo 24 del Acuerdo 096. La fórmula (principal y suplente) que obtenga el mayor número de votos válidos será la ganadora, conforme al artículo 25. Posteriormente, el Comité Electoral publicará el acta oficial con los resultados, según lo establecido en el artículo 26 del mismo Acuerdo.$$,
$$Informar: 12 de noviembre de 2026 en la página web de la Universidad. Base: Acuerdo 097; Acuerdo 096, arts. 24, 25 y 26.$$),

-- 15
($$No tengo un dispositivo para votar. ¿Puedo votar de otra manera?$$,
$$La votación se realizará exclusivamente de manera electrónica, de conformidad con el artículo 13 del Acuerdo 096. Según el artículo 22 del mismo Acuerdo, podrá ingresar desde un computador o dispositivo móvil con conexión a internet y cámara funcional. Por tanto, le recomendamos solicitar prestado un dispositivo que cumpla con estos requisitos para realizar personalmente su votación. Recuerde que, conforme al artículo 1 del Acuerdo 096, el voto es personal e indelegable, por lo que ninguna otra persona puede votar en su nombre.$$,
$$Informar que solo hay voto electrónico; recomendar un dispositivo prestado con internet y cámara. Nadie puede votar por él. Base: Acuerdo 096, arts. 1, 13 y 22.$$),

-- 16
($$No me llega el correo o el mensaje al teléfono.$$,
$$Le recomendamos solicitar nuevamente el envío del mensaje de verificación requerido para el ingreso a la plataforma. De conformidad con el artículo 22 del Acuerdo 096, el proceso contempla un mecanismo de autenticación digital para validar la identidad del votante. Si el mensaje no llega, verifique la cobertura de su dispositivo, revise las bandejas de correo no deseado o spam y confirme que cuenta con conexión a internet. Si después de estas verificaciones persiste el inconveniente, comuníquelo a la Mesa de Atención para recibir la orientación correspondiente.$$,
$$Pedir reenvío del mensaje; revisar spam, cobertura e internet. Si persiste, dejar PENDIENTE y escalar. Base: Acuerdo 096, art. 22.$$),

-- 17
($$Tengo más de un título de la Universidad de Córdoba. ¿Cuál uso?$$,
$$Debe utilizar los datos correspondientes al último título obtenido en la Universidad de Córdoba. De conformidad con el parágrafo primero del artículo 15 del Acuerdo 096, los egresados que hayan obtenido varios títulos en la Universidad solo podrán ejercer su derecho al voto una sola vez, independientemente del número de títulos que haya obtenido en la Institución. Por tanto, la plataforma validará las credenciales correspondientes a su último título académico.$$,
$$Usar el acta y la fecha de grado del último título. Base: Acuerdo 096, art. 15, parágrafo 1.$$),

-- 18
($$Trabajo en la Universidad y también soy egresado. ¿Puedo votar?$$,
$$Sí. De conformidad con el parágrafo segundo del artículo 15 del Acuerdo 096, los funcionarios de la Universidad de Córdoba que tengan la calidad de egresados graduados de programas de pregrado o posgrado pueden participar en la elección como egresados, siempre que se encuentren incluidos en el censo electoral definitivo.$$,
$$Sí puede votar si está en el censo electoral definitivo. Base: Acuerdo 096, art. 15, parágrafo 2.$$),

-- 19
($$Creo que hubo una irregularidad en la votación. ¿Dónde reclamo?$$,
$$Si considera que se ha presentado alguna irregularidad durante el proceso electoral, puede presentar su queja o reclamación directamente ante el Comité Electoral, instancia competente para recibir y resolver este tipo de solicitudes, de conformidad con los literales e y f del artículo 9 del Acuerdo 096. Para ello, puede remitir su comunicación al correo electrónico eleccionegresados@correo.unicordoba.edu.co, indicando los hechos y, si corresponde, adjuntando los soportes que considere pertinentes.$$,
$$Remitir al Comité Electoral: eleccionegresados@correo.unicordoba.edu.co (hechos y soportes). Base: Acuerdo 096, art. 9 lit. e y f.$$),

-- 20
($$Consulta ajena al propósito de la Mesa de Atención$$,
$$Le informamos que esta Mesa ha sido dispuesta exclusivamente para brindar información y soporte técnico durante la jornada de votación electrónica del representante de los egresados ante el Consejo Superior Universitario. Por tanto, nuestra atención se limita a resolver inquietudes relacionadas con el proceso electoral y las dificultades técnicas que puedan presentarse. Para cualquier otro tipo de solicitud, le recomendamos utilizar los canales institucionales correspondientes. Agradecemos su comprensión.$$,
$$Informar el alcance de la Mesa y remitir a los canales institucionales correspondientes.$$)

) AS v(pregunta, respuesta, resolucion)
WHERE NOT EXISTS (SELECT 1 FROM public.respuestas r WHERE r.pregunta = v.pregunta);

COMMIT;

-- Verificación: debería listar las preguntas cargadas
-- SELECT id, pregunta FROM public.respuestas ORDER BY pregunta;
