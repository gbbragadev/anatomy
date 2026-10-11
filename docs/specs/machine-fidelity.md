# Anatomy com fidelidade técnica modular

Especificação arquitetural normalizada, versão 0.2 • 11 outubro 2026

## Escopo e estado de implementação

Este documento registra a arquitetura aprovada e requisitos futuros do toolkit. A fundação implementa o roteamento opt-in, a proteção byte/API do legado, a fronteira isolada de dependências e os contratos estritos de máquina, unidades SI e evidências, além da compilação canônica de montagem, geometria analítica e juntas fixas, revolutas e prismáticas com acoplamentos de razão limitados. Solução genérica de fechamento continua indisponível e é diagnosticada explicitamente. Receitas executáveis, modelos, adaptadores fiéis e harnesses de domínio ainda não estão implementados. O reconhecimento do nome de uma receita no contrato não implementa essa receita. Nomes de interfaces e arquivos futuros abaixo são requisitos, não APIs disponíveis ou resultados executados.

O benchmark público é um elevador genérico de canecas por correia, com evidência E0 de hipótese. Não há fabricante, modelo, manual, CAD nem medidas de uma máquina real identificada. E0 não sustenta dimensões F1, capacidade real, segurança, desgaste ou previsão operacional.

Convenções canônicas: sistema destro, Z-up, metros, radianos, vetores coluna, transformações ativas e quaternions xyzw. A configuração usa schemaVersion 0.1.0. O fixture guarda C calculado por (5 - 2π × 0.20) / 2 = 1.8716814692820414 m, nunca o valor arredondado de impressão. O estudo inicial usa dt fixo de 1/120 s e comparação com dt/2.

Toda ferramenta distingue cobertura executed/skipped/partial de veredicto passed/failed/not-evaluated. Renderização no navegador é interativa. Renderização offline de alta qualidade, conversão nativa STEP/CAD, DEM/FEA, solvers genéricos de restrições, descarga calibrada e WebGPU são capacidades adiadas.

## Visão geral

### Resumo executivo
A extensão deve transformar a Anatomy em uma SKILL com toolkit reutilizável para representar máquinas com fidelidade verificável. O núcleo proposto descreve peças, relações mecânicas, evidências e estado; SVG e renderização por malhas consomem esse núcleo. A prioridade é a correspondência com a máquina real, inclusive nos detalhes que um especialista percebe. Qualidade visual, desempenho e custo são avaliados separadamente para que acabamento não esconda erro construtivo ou de comportamento.

A primeira mudança é separar dois modos. O upstream incentiva inventar um objeto explicativo e enriquecer o desenho; fidelidade à referência exige preservar o que as evidências mostram e identificar o que não se sabe. O modo criativo permanece disponível, mas suas regras de ornamentação não se aplicam ao modo fiel. A decisão arquitetural é manter o kit e adicionar contratos, adaptadores e receitas de domínio. O ganho inicial vem de corrigir esse roteiro e orquestrar as auditorias existentes antes de construir um backend novo. O upstream já oferece geometria procedural, auditorias, interação, movimento e efeitos WebGL. Não oferece, como contrato público estável, todo o modelo industrial necessário. A inspeção desta versão usa o commit dbf697a527bbf7d358668e1557cb1e35ff725d46. Os pontos de integração e as limitações são explicitados nas seções seguintes. [U1–U5]

O primeiro recorte usa um elevador genérico de canecas por correia para exercitar a arquitetura e seus contratos. Como ainda não há fabricante, modelo, manual, CAD ou medições da unidade real, não é possível alegar paridade dimensional, capacidade, desgaste ou previsão operacional. Um conjunto de parâmetros ilustrativos serve para testar os contratos e a causalidade. A correspondência com uma unidade específica depende de evidências adicionais.

### O que esta revisão torna concreto
- Um contrato com unidades, IDs estáveis, fontes, incertezas, juntas, materiais e vínculos entre assets e peças.
- Uma trilha completa de evidência, estado, desenho, interação e teste, incluindo falhas que devem reprovar a cena.
- Perfis independentes de fidelidade, renderização e desempenho, com limites de validade por afirmação.
- Uma SKILL curta que carrega receitas sob demanda, apoiada por ferramentas verificadoras e revisão especializada.

# Base real e pontos de integração
### O que foi verificado no upstream
A Anatomy organiza figuras técnicas em SVG com geometria e comportamento em JavaScript ou TypeScript. Sua SKILL é editorial: recomenda inventar o objeto, não copiar a referência e manter grande densidade de detalhes. No modo fiel, cada parafuso, tubo e apoio precisa de função e evidência; contagem mínima de peças e preenchimento ornamental deixam de ser critérios. O modo 3D usa partes e grupos transformáveis, projeção, ordenação e pintura; os efeitos WebGL inseridos na figura não constituem, por si, um renderizador geral de malhas PBR. Há exemplos com mecanismos, auditorias de montagem e scripts de captura e desempenho. Essas capacidades devem ser aproveitadas sem converter seus testes visuais em evidência de física industrial. [U1–U5]

| Área existente | Costura proposta | Restrição |
| --- | --- | --- |
| kit/iso-kit.mjs e iso-kit.ts | Adaptador SVG usa câmera, sólidos e composição existentes | Não acrescentar física dentro das funções de desenho |
| kit/lathe.mjs e kit/tube.mjs | Compilação de peças procedurais e rotas com IDs do contrato | Preservar parâmetros geométricos e mapa peça para desenho |
| kit/audit.mjs | Alimentar recorder, settle e auditOrExit com geometria compilada | Aprovação vale para formas e hipóteses registradas |
| kit/turn-build.mjs e turn.mjs | Traduzir montagem e snapshots para grupos e transformações | Grupos e ranges não substituem limites e acoplamentos mecânicos |
| scripts/capture.mjs e drive.mjs | Capturas em estados e comandos reproduzíveis | Imagens isoladas não verificam todas as transições |
| scripts/turn-check.mjs e turn-bench.mjs | Baselines de ordenação, fidelidade e custo | Ampliar cobertura com casos do domínio |

### Compatibilidade que pode ser testada
O uso legado deve continuar sem machine.json, GPU obrigatória ou dependências de importação CAD. A proposta adiciona um ponto de entrada separado e adapta seus dados ao kit existente. As assinaturas legadas e a saída dos exemplos são comparadas com o commit fixado. Diferenças intencionais precisam de motivo, revisão e baseline versionado; trocar a imagem esperada não é uma correção suficiente.

turn-build serializa grupos turn, hinge, slide e free, mas ranges são metadados: t3Poses e controller.set não impõem limites nem resolvem acoplamentos. A camada de máquina precisa fazê-lo antes do adaptador. Uma peça física pode gerar vários fragmentos convexos de render; o mapeamento deve ser um para muitos, nunca confundir fragmento com peça. O adaptador traduz esse mapeamento e emite erros pelo ID da peça e caminho do campo.

### O que a inspeção não autoriza afirmar
A CI observada reconstrói HTML e verifica diferenças; não executa toda a suíte geométrica, browser e de desempenho. A presença de auditorias não demonstra validação de qualquer máquina industrial. Casos de avaliação descritos em prosa não equivalem a um ensaio automatizado de fidelidade construtiva e dinâmica. Esta revisão é baseada em leitura do código e das fontes; não apresenta resultados novos de benchmark, execução de CI ou comparação com máquina real. [U4–U5]

# Arquitetura e fluxo de dados
### Separação de responsabilidades
O pacote genérico é dividido em contrato, compilação de montagem, execução do modelo, adaptadores de apresentação e avaliação. Um pacote de domínio acrescenta vocabulário, equações limitadas ao domínio, regras de montagem, fixtures e exemplos. A cena guarda apenas configuração, referências e assets próprios. Essa divisão evita que cada equipamento reinvente o relógio, os IDs, a conservação de massa e o relatório de evidência.

| Camada proposta | Entrada e saída | Não deve fazer |
| --- | --- | --- |
| contracts | Dados brutos para dados tipados e diagnósticos | Inferir medidas ausentes como se fossem verificadas |
| assembly | Peças e juntas para grafo e geometria compilada | Escolher luz, câmera ou velocidade de apresentação |
| model | Estado e comandos para novo estado e eventos | Ler DOM, câmera ou taxa de quadros |
| adapters/svg e adapters/mesh | Geometria e snapshot para representação visual | Manter uma segunda simulação |
| inspect | Seleção, câmera, corte e explosão para estado de apresentação | Alterar inventário físico ou posição de montagem original |
| verify | Referências, traços e capturas para resultados rastreáveis | Conceder aprovação com base apenas em um parecer de IA |

### Fluxo proposto de uma execução
1. Resolver manifesto, licenças e evidências; validar schema e referências cruzadas.
2. Converter unidades para SI e compilar a montagem. Emitir um relatório de dimensões desconhecidas, colisões e capacidades por backend.
3. Inicializar estado, seed e sequência de comandos. O modelo avança por passos definidos e registra eventos ordenados.
4. Publicar snapshots imutáveis. A apresentação interpola apenas coordenadas independentes contínuas e deriva novamente as poses com as restrições.
5. Derivar leituras, seleção e testes dos mesmos IDs e grandezas. Gravar o pacote de evidência da execução.

### Interfaces mínimas propostas
validateMachine(spec) retorna dados normalizados ou erros; compileAssembly(spec, assets) retorna montagem e capacidades; createModel(spec, initialState, seed) cria o núcleo; step(state, commands, dt) retorna state, events e diagnostics. mountRenderer(target, compiled, options) expõe render(snapshot, viewState), pick, capture e dispose. Estes nomes são proposta de interface, não APIs existentes do upstream.

A montagem física, o grafo de restrições e a árvore de renderização são estruturas distintas. Um mecanismo fechado não cabe apenas numa árvore de pais. O renderer recebe poses por partId, grandezas com unidade e a versão do snapshot. Não pode modificar o estado original. O modelo não recebe objetos Three.js, nós SVG ou materiais do navegador. Geometria para desenho, geometria para auditoria e geometria de contato podem ser distintas, mas todas apontam para as mesmas peças e declaram a aproximação. Uma malha bonita nunca substitui silenciosamente a forma usada no teste de folga.

# Frames precisão e adaptação ao legado
### Convenção que elimina offsets improvisados
Usar vetores coluna e transformações ativas em sistema destro, quaternions na ordem xyzw, ângulos em radianos e posição em metros. A montagem guarda transforms locais de repouso; o snapshot publica poses resolvidas em mundo. A árvore de transforms é acíclica e ordenada por pais. O grafo de restrições é separado e pode conter laços, que exigem solução e resíduo explícitos. Não rejeitar um mecanismo fechado por ter um ciclo legítimo de restrições.

Uma junta possui frame no pai T_PJ e frame no filho T_CJ; eixo e deslocamento são expressos no frame da junta. A composição proposta é T_WC = T_WP × T_PJ × M(q) × inversa(T_CJ). M(q) representa apenas o grau de liberdade permitido. Esse contrato permite verificar eixos coincidentes, sinal, zero e limites sem depender do renderer.

O builder upstream recebe coordenadas de mundo em repouso e internamente subtrai origens dos grupos. O adaptador deve converter nossos frames locais para essa convenção, ordenar os pais e manter um mapa de canais válidos. Enviar diretamente poses locais produz offsets duplicados. TURN.mount e controller.set são a costura de atualização; limites e acoplamentos são resolvidos antes deles. turn e hinge recebem graus no legado: converter q × 180/π apenas nessa fronteira e converter leituras de volta. slide usa unidade de desenho. [U3]

### Unidades de desenho não são metros
Há constantes e arredondamentos no kit. turn-build usa pack3 com passo de 0,001 unidade de desenho. supports usa defaults touch = 0,15 e sunk = 0,5; solidClearances usa sunk = 0,5. Interpretar a entrada diretamente em SI pode significar arredondamento milimétrico e tolerâncias de 150 ou 500 mm. Esses números são achados do código, não tolerâncias mecânicas aprovadas. [U6]

Definir metersPerLegacyUnit por cena e converter comprimentos e limiares explicitamente. O adaptador deve parametrizar ou substituir os checks cujos defaults não servem ao erro admissível. Converter unidades não corrige sozinho todas as heurísticas. Manter dimensões canônicas sem quantização e exigir um teste de ida e volta de folga crítica, no zoom de inspeção, antes de aceitar o backend.

### Provas mínimas do adaptador
Testar uma cadeia de três frames contra solução manual; um eixo assimétrico com rotação positiva; milímetros para metros; roundtrip de duas interfaces com pequena folga; e peça física dividida em vários fragmentos preservando seleção. Em glTF, aplicar Z para cima → Y para cima uma vez: (x, y, z) → (x, z, −y). A mesma rotação vale para eixos, normais e câmeras; somente comprimentos recebem escala. Uma câmera que enquadra tudo pode esconder erro de unidade, portanto a validação usa medidas, não enquadramento. [G1]

# Contrato da máquina e exemplo serializado
### Regras do formato
Propõe-se JSON validado por schema, com versionamento explícito, SI interno e sistema destro com Z para cima. Eixos e unidade originais permanecem no manifesto. glTF usa Y para cima; a conversão para o frame de máquina Z para cima deve ser uma transformação explícita, testada também nos eixos das juntas. [G1] IDs são estáveis, exclusivos e independentes da ordem dos arrays. Uma peça repetida tem ID de instância e referência à definição comum. Transformações locais e origem de cada junta são obrigatórias; escalas negativas ou não uniformes exigem normalização antes de contato ou auditoria. [S1]

O exemplo abaixo é um recorte deliberadamente pequeno. Os números são ilustrativos, não medições de uma máquina identificada nem dados de fabricante. null significa informação ausente; não significa tolerância zero. proposedTolerance é um critério a aprovar, separado da incerteza da fonte.

```json
{
  "schemaVersion": "0.1.0",
  "machineId": "bucket-elevator-demo",
  "frame": {"handedness": "right", "up": "Z", "unit": "m"},
  "sources": [{"id": "E0", "kind": "assumption",
    "locator": "worked-example", "confidence": "unverified"}],
  "parameters": {"headRadius": {
    "value": 0.20, "unit": "m", "sourceIds": ["E0"],
    "uncertainty": null, "proposedTolerance": 0.002}},
  "parts": [{"id": "head-pulley", "assemblyId": "head",
    "geometry": {"kind": "cylinder", "radiusRef": "headRadius"},
    "materialId": "painted-steel", "evidenceIds": ["E0"]}],
  "joints": [{"id": "head-shaft", "kind": "revolute",
    "parent": "frame", "child": "head-pulley",
    "parentFrame": {"position": [0, 0, 1.8716814692820414],
      "rotation_xyzw": [0, 0, 0, 1]},
    "childFrame": "shaft-center", "axisIn": "joint",
    "axis": [0, 1, 0]}],
  "materials": [{"id": "painted-steel", "preset": "paint",
    "surfaceEvidenceIds": ["E0"], "physicalProperties": null}],
  "model": {"recipe": "belt-bucket/kinematic-mass-v1",
    "assumptions": ["no-slip", "rigid-buckets"]}
}
```

### Campos que impedem ambiguidade
O schema completo acrescenta peça frame, frame local shaft-center, espessuras, largura, transforms, assets com hash e licença, parâmetros de processo, estados iniciais e critérios. O recorte acima não é um arquivo executável completo. Relações inválidas, ciclos na árvore de transforms, eixos nulos, NaN, unidade desconhecida, referência inexistente e massa negativa são erros de validação. Evidência ausente pode ser admitida em uma cena ilustrativa, mas bloqueia a afirmação correspondente de fidelidade.

A migração de versão gera um novo manifesto e registra campos alterados; não reinterpreta silenciosamente milímetros como metros. Campos específicos de domínio ficam em namespaces. O validador deve recusar um domínio que não conhece ou carregar explicitamente o pacote que o define.

# Estado temporal e rastreio reproduzível
### Relógio do modelo e relógio da tela
O estado mínimo contém tick, tempo, deslocamento acumulado da correia sem módulo, velocidade, fase do acionamento, inventário por compartimento e eventos. Para renderizar entre ticks, interpolar esse deslocamento e resolver de novo caminho e poses. Interpolar XYZ ou quaternions de cada caneca separadamente pode cortar o arco e desprendê-la da correia. Inventário e eventos discretos não são interpolados; a leitura mantém o valor efetivo no tick. Um comando inclui ID, tipo, valor com unidade e tick de aplicação. Pausar congela o relógio; parar o acionamento inicia a lei de desaceleração; reiniciar restaura estado e seed; mudar a velocidade de apresentação não muda a física do modelo.

Propõe-se passo fixo com acumulador e limite de recuperação por quadro. Para o recorte cinemático, um passo inicial de estudo pode ser 1/120 s, a validar por convergência e custo. Não é uma frequência garantida nem necessária para todos os domínios. Se a tela atrasar, o sistema reduz trabalho visual ou sinaliza atraso; não aumenta dt silenciosamente nem descarta massa. Eventos dentro de um passo usam subpasso ou localização analítica quando atravessam uma fronteira relevante. Com contato, escolher dt por convergência e deslocamento relativo às menores espessuras; o passo do modelo cinemático não pode ser herdado sem teste por uma simulação de grãos. [M1]

### Traço ilustrativo de um comando
Neste exemplo, v = 0,50 m/s e r = 0,20 m; a relação sem escorregamento dá velocidade angular de 2,50 rad/s. Uma janela de 0,10 s desloca a correia 0,05 m e gira o tambor 0,25 rad. A tabela resume essa janela, composta por passos menores; não recomenda integrá-la como um único passo.

| Campo | Antes | Depois | Verificação |
| --- | --- | --- | --- |
| time_s | 1,00 | 1,10 | Relógio monotônico |
| beltTravel_m | 0,50 | 0,55 | Integral da velocidade |
| headAngle_rad | 2,50 | 2,75 | Δângulo = Δdeslocamento / raio |
| bucket007_mass_kg | 0,80 | 0,60 | Evento transfere 0,20 kg |
| discharge_mass_kg | 1,20 | 1,40 | Mesmo evento, destino explícito |
| totalAccounted_kg | 2,00 | 2,00 | Conservação neste recorte fechado |

A transferência de 0,20 kg é um evento sintético do fixture, não uma previsão de descarga. Ele permite provar que o mesmo evento altera estado, leitura e desenho, e que a contabilidade não depende do número de partículas desenhadas. O inventário total de uma cena inclui todos os compartimentos, não apenas os dois exibidos nesta tabela.

### Repetibilidade e diagnóstico
O replay guarda hash da configuração, versão do modelo, seed, dt e comandos ordenados. O mesmo ambiente deve produzir os mesmos eventos e resultado; entre plataformas, comparar dentro de tolerâncias numéricas declaradas quando não houver determinismo bit a bit. Logs apontam tick, partId e sourceId. Capturar screenshot sem esses dados torna um defeito de movimento difícil de reproduzir.

# Evidências e reconstrução da referência
### A unidade de verdade é uma afirmação verificável
Cada afirmação tem claimId, objeto, fonte, localização na fonte, método de extração, incerteza, condição de validade e status. “Diâmetro do tambor” e “sentido de descarga” são afirmações diferentes e podem ter evidências de qualidade diferente. Um manual pode estabelecer operação; não comprova que uma fotografia mostra exatamente a mesma revisão. A confiança não deve ser condensada em uma nota única para a máquina inteira.

| Afirmação | Evidência adequada | O que continua desconhecido |
| --- | --- | --- |
| Dimensão de um eixo | Desenho cotado ou medição com referência | Tolerância de fabricação se ausente |
| Posição de uma peça | Vistas calibradas ou CAD da montagem | Geometria escondida sem outra vista |
| Relação de transmissão | Dados de transmissão ou medição sincronizada | Escorregamento e resposta sob carga |
| Tipo de descarga | Manual e vídeo de operação identificados | Distribuição de vazão em outros materiais |
| Acabamento e desgaste | Fotos controladas da unidade | Propriedades físicas internas |

### Processo de reconciliação
Catalogar fontes antes de modelar. Separar original, derivado e anotação; guardar hash e revisão. Registrar a escala, lente e orientação de fotos quando disponíveis. Conferir se o material, a configuração e a data correspondem ao uso pretendido. Quando fontes divergem, abrir uma pendência com as alternativas; não fazer a média de desenhos de modelos diferentes.

Reconstruir primeiro eixos, interfaces, envelopes e caminho do material. Depois, espessuras, fixações, folgas, tampa, reforço e detalhe superficial. Um parafuso pode ser crítico se fixa uma caneca à correia; uma chapa distante pode ser simplificada. A criticidade vem da função, do risco de enganar e da inspeção prevista, não só da área em pixels.

### Limite da referência disponível
Uma imagem isolada não determina escala absoluta, profundidade escondida, juntas internas, relação de transmissão, atrito ou capacidade. Fotos, vídeo e reconstrução visual podem apoiar forma observada, mas não autorizam completar detalhes ocultos como fatos. No benchmark genérico, as partes não documentadas devem permanecer genéricas e nomeadas como hipóteses. Equipamentos de outros domínios ficam fora deste recorte.

O pacote final deve permitir responder: “De onde veio esta medida?”, “Quem verificou esta folga?” e “Qual revisão sustenta este mecanismo?”. Se a resposta não existir, a interface e o relatório devem mostrar essa limitação na afirmação afetada.

# Geometria CAD e proveniência de assets
### Escolher a representação pela pergunta
CAD autorizado é a melhor entrada quando a tarefa exige dimensões, montagem e superfícies exatas fornecidas pelo projeto. A cadeia preserva o original e converte uma cópia para renderização. No fluxo CAD, conferir também contagem de instâncias, área, volume e centroide quando fornecidos pelo importador. [G2] A tesselação aproxima superfícies; sua tolerância de corda e ângulo deve estar abaixo do erro admitido no detalhe inspecionado. Importar STEP, gerar malha e exportar glTF não preserva automaticamente juntas, materiais reais ou intenção de projeto. [G1–G2]

| Entrada | Uso recomendado | Limitação a registrar |
| --- | --- | --- |
| STEP ou CAD autorizado | Geometria nominal e estrutura disponível | Pode omitir configuração de operação e tolerâncias |
| Desenho cotado | Construção paramétrica por dimensões | Exige resolver vistas e detalhes ausentes |
| Fotos e vídeo calibrados | Forma, textura e movimento visíveis | Oclusão, reflexos e escala afetam reconstrução |
| Modelo procedural genérico | Explicar mecanismo e validar contrato | Não representa uma unidade identificada |
| Malha artística ou gerada | Proposta visual e referência provisória | Não comprova medidas, juntas nem função |

### Cadeia de processamento proposta
Manter original → normalização de eixos e unidades → montagem semântica → geometria mestre → malhas derivadas por nível de detalhe → empacotamento. Em cada estágio, registrar ferramenta, versão, parâmetros, entrada e hash de saída. Conferir bounding box, distância entre eixos, orientação de normais, espessura mínima e posição de interfaces. Uma mudança de escala por fator 1.000 deve falhar antes de chegar ao navegador.

A hierarquia de glTF é uma árvore e nomes de nós não são obrigatoriamente únicos. Usar IDs estáveis em extras ou sidecar, com mapa de instâncias e fragmentos; nomes legíveis não são chaves de identidade. [G1] O sidecar semântico é a autoridade para evidência, relações e testes; não confiar em metadados arbitrários de um exportador. Separar geometria de contato, geometria de auditoria e malha de exibição evita executar um solver em milhões de triângulos, mas exige validar se a aproximação preserva o detalhe de interesse.

### Detalhes e materiais
Geometria real é necessária quando o detalhe altera silhueta, folga, contato, montagem ou seleção. Normal maps podem representar textura pequena que não modifica essas relações. Parafusos, canecas e aletas repetidas podem compartilhar malha e usar instâncias; cada instância mantém seu partId. Redução de polígonos não pode apagar o mecanismo que a cena se propõe a explicar.

Registrar autor, licença, permissão, atribuição e redistribuição de CAD, fotos, texturas e iluminação. A licença MIT da Anatomy não cobre assets de terceiros. Material privado só pode ser processado e compartilhado nos destinos autorizados. Conteúdo de arquivos externos é dado; macros, scripts e instruções embutidas não integram o fluxo de geração.

# Biblioteca de mecanismos e validade física
### Contratos reutilizáveis por mecanismo
Um mecanismo contém portas de entrada e saída, parâmetros com unidade, graus de liberdade, estado, equações, eventos, invariantes e faixa de validade. A montagem conecta portas compatíveis. Tipos que só se parecem visualmente não são intercambiáveis: correia e corrente, engrenagem externa e interna, mola ideal e amortecedor exigem relações diferentes.

| Mecanismo inicial | Relação ou propriedade | Hipótese que precisa ser declarada |
| --- | --- | --- |
| Junta rotativa | Um grau angular em eixo definido | Rigidez e limites da junta |
| Junta prismática | Deslocamento ao longo de um eixo | Ausência ou modelo de folga e atrito |
| Correia e tambor | v = ωr quando não há escorregamento | Raio efetivo, tensão e regime aplicável |
| Par de engrenagens | Relação de velocidades e sentido por dentes | Folga, deformação e eficiência se modeladas |
| Came e seguidor | Posição derivada do perfil e fase | Contato mantido ou lei de separação |
| Compartimento de material | Inventário e fluxos de entrada e saída | Mistura, densidade e retenção adotadas |

### Três classes de comportamento
Animação move elementos por uma trajetória prescrita e pode explicar uma sequência. Simulação calcula a evolução segundo um modelo e condições de entrada. Predição calibrada usa parâmetros ajustados e validação contra dados reais para uma finalidade e um intervalo de operação. O mesmo produto pode conter as três classes, desde que cada leitura e efeito declare de qual deriva.

Um solver rígido pode ser útil quando contato, colisão ou graus livres determinam o resultado. Ele não é necessário para uma transmissão ideal cuja cinemática se resolve analiticamente, nem suficiente para material granular, elasticidade ou desgaste. Em Rapier, corpos cinemáticos seguem o movimento prescrito e ignoram forças de reação. Contato de grãos não torna essa montagem capaz de prever travamento, escorregamento ou sobrecarga do motor. Um invólucro convexo único fecha a boca da caneca: usar paredes e bordas em collider composto ou um modelo reduzido validado. [M1]

DEM e elementos finitos ficam como análises especializadas. Granularidade visual não demonstra material calibrado. Atrito, restituição, forma e coesão exigem ensaios complementares; ajustar apenas ângulo de repouso não determina toda a descarga. Validar em velocidades e alimentações diferentes das usadas na calibração. [M2]

### Limites de evidência
Conservação e restrições verificam coerência do modelo. Comparação com ensaio verifica sua adequação à realidade observada. Passar em ambos ainda não permite extrapolar para outra rotação, material, umidade, carga ou geometria. A validação deve declarar quais observáveis foram comparados, onde, por quem e com que incerteza. [V1]

A biblioteca não terá um “motor universal” que deduz física a partir da malha. Um mecanismo não reconhecido interrompe a geração daquele comportamento e pede uma receita ou decisão técnica. Geometria aproximada e movimento decorativo não podem receber o rótulo de comportamento validado.

# Transporte no elevador de canecas
### Caminho e identidade das canecas
A receita inicial representa um caminho fechado de correia, com segmentos retos e arcos tangentes. Sua parametrização por comprimento permite que uma coordenada acumulada s determine posição e tangente. A caneca i ocupa s_i = (s + i p) módulo L, com passo p e comprimento L consistentes. A geometria compilada verifica continuidade e orientação; a caneca conserva ID ao cruzar a emenda numérica do caminho.

A orientação decorre do vínculo com a correia e da montagem da caneca, não de um giro independente escolhido para parecer plausível. O raio de referência precisa distinguir linha neutra da correia, raio do tambor e deslocamento do ponto de fixação. Simplificar esses raios é permitido no modelo genérico se o erro e sua consequência forem declarados. Quando L e p não fecham um número inteiro de canecas, o gerador deve rejeitar ou resolver explicitamente a configuração.

### Inventário e eventos
O material é contabilizado em alimentação, canecas, região de descarga, saída, retorno e perdas declaradas. A equação global é M_inicial + M_entrada = M_inventário + M_saída + M_perdas, dentro de tolerância numérica aprovada. Transferências são atômicas: o que sai de um compartimento entra em outro no mesmo evento. Distinguir densidade a granel de densidade do sólido e declarar a convenção de capacidade da caneca. No regime ideal, Q_v = V φ v/p, com V volume efetivo e φ fração média de enchimento; esse cálculo verifica unidades e coerência, mas não fornece capacidade real sem preenchimento e descarga validados. [M4]

A descarga ilustrativa pode ser prescrita por zona e fração transferida para demonstrar o processo. Uma descarga preditiva exige modelar e validar retenção, gravidade, velocidade, forma da caneca, interação entre grãos e trajetória. O número adimensional v²/(gr) ajuda a caracterizar a competição entre aceleração centrípeta e gravidade, mas não determina sozinho eficiência de descarga ou capacidade da máquina. O modelo não deve aplicar uma fórmula simplificada fora de seu escopo. [M3]

### Efeitos visuais e diagnósticos
Na trajetória após a liberação, a velocidade inicial inclui o movimento do ponto de saída; lançar grãos parados na borda perde a componente tangencial. Partículas representam amostras visuais do inventário. Cada amostra pode ter peso, mas o contador oficial vem do estado agregado. Trocar 2.000 partículas por 200 por desempenho não pode reduzir massa transportada. Atrito, impacto, poeira, derramamento e vibração só alteram métricas físicas quando vinculados a um modelo declarado; do contrário, são efeitos identificados de apresentação.

Cobrir partida, regime, alimentação interrompida, parada com material, retomada, recipiente cheio e reversão proibida. Para cada caso, definir comandos válidos e resultado esperado. Varrer obrigatoriamente os dois arcos e a emenda durante uma volta completa para conferir folgas entre canecas e carcaça. Se a fonte não sustenta reversão, não adicionar esse controle por conveniência. Corte e explosão são modos de inspeção; não representam operação segura de uma máquina real aberta.

# Níveis de fidelidade e limites de afirmação
### Usar um perfil por eixo
A fidelidade é um vetor: construção, cinemática, processo e aparência recebem status próprios. A cena pode ter construção referenciada, movimento coerente e processo ainda ilustrativo. Não haverá uma nota geral de “95% realista” que esconda um detalhe crítico errado. Requisitos críticos funcionam como veto dentro da afirmação a que pertencem.

| Nível proposto | Evidência mínima | Afirmação permitida |
| --- | --- | --- |
| F0 ilustrativo | Hipóteses listadas e coerência interna básica | Explica um princípio com parâmetros genéricos |
| F1 construtivo referenciado | Peças e dimensões selecionadas comparadas com fontes | Corresponde aos detalhes identificados no escopo |
| F2 cinemático verificado | Juntas, relações e traços testados em estados definidos | Reproduz a cinemática declarada nesses estados |
| F3 quantitativo validado | Ensaios independentes, incerteza e domínio de validade | Prevê observáveis específicos dentro do domínio avaliado |

Esses níveis resumem exigências de evidência; não autorizam promover todos os eixos juntos. PBR avançado pode ser F0 construtivo. Uma vista SVG com boas medições pode satisfazer F1 em dimensões escolhidas. Para aparência, o relatório descreve material, câmera, luz e referências comparadas, em vez de apresentar fotorealismo como prova de construção.

### Critérios locais de aceitação
Distinguir tolerância de fabricação, incerteza de medição e tolerância numérica. Uma dimensão recebe ainda um critério de aceitação do projeto, que não pode ser apresentado como especificação do fabricante. [V2] Se a incerteza da medida é maior que a tolerância pretendida, a evidência não suporta a decisão. Folgas críticas exigem método geométrico e revisão. Compare imagens com câmera e escala alinhadas; erros de perspectiva não devem ser confundidos com erros da peça.

Cada resultado é aprovado, reprovado ou não avaliado. “Não avaliado” permanece explícito e impede apenas a afirmação que depende dele. A aprovação de uma montagem não aprova capacidade, segurança, durabilidade ou desempenho em outras condições. O responsável técnico deve assinar o escopo da revisão; o sistema apenas preserva essa decisão e sua evidência.

### Como evoluir sem refazer tudo
Uma fonte melhor substitui a hipótese ligada ao claimId e invalida os testes dependentes. O grafo de dependências identifica peças, modelos, capturas e leituras afetados. A evolução de F0 para F1 não exige trocar o renderizador; a evolução para F3 pode exigir mudar o modelo, medir novos parâmetros e obter ensaios. É esse caminho de refinamento rastreável que a arquitetura deve suportar. [V1]

# Materiais iluminação e renderização
### Caminho de assets e cor
A saída por malhas deve usar geometria e materiais preparados offline e distribuídos em glTF ou GLB quando adequado. O pipeline conserva unidades e IDs no manifesto, valida o asset e associa cada mesh às peças. glTF define materiais metallic roughness; isso não garante que os valores exportados correspondam à superfície real. Pintura sobre metal, borracha e metal exposto precisam de tratamentos coerentes. [G1, R1]

Texturas de cor são interpretadas no espaço de cor apropriado; mapas de normal, rugosidade e metalicidade são dados. A iluminação é calculada no espaço de trabalho linear e convertida para exibição. Registrar exposição, tone mapping, ambiente, câmera e versão do renderer nas capturas evita que uma mudança de pós-processamento seja confundida com melhora geométrica. [R2–R3]

### Ordem de refinamento proposta
Primeiro aprovar silhueta, escala, apoios e relações de montagem em material neutro. Depois ajustar materiais observáveis, luz de inspeção e sombras. Só então acrescentar desgaste documentado, microtextura e efeitos. Luz de apresentação pode favorecer leitura, mas uma luz neutra de inspeção também deve existir para revelar folgas, colisões e superfícies. Não usar oclusão ambiente intensa para disfarçar peças que não se encostam.

Geometria determina silhueta e contato. Normal maps acrescentam resposta de superfície. Sombras ajudam a perceber separação, mas seu custo e artefatos exigem teste. Transparência, clipping, materiais transmissivos e efeitos em camadas têm limitações diferentes por backend. Cortes devem mostrar bordas ou tampas coerentes quando a interpretação exigir volume e preservar colliders operacionais. Apenas esconder pixels pode sugerir uma chapa sem espessura; remover colliders pode fazer o material vazar por uma abertura que só existe na apresentação.

### Escolha inicial do backend
Recomenda-se avaliar um adaptador de malhas com Three.js, mantendo a decisão final para o piloto. WebGLRenderer é um candidato conservador para o primeiro percurso; WebGPURenderer deve passar por uma matriz real de recursos, dispositivos e custo. A documentação oficial alerta para diferenças de suporte e possíveis perdas de desempenho em alguns casos; tecnologia mais nova não garante melhor resultado. Não se promete intercâmbio transparente entre eles. A profundidade de efeitos WebGL não resolve automaticamente oclusão com sólidos SVG; o novo adaptador deve desenhar sólidos GPU numa cena coerente. Módulos experimentais upstream não são um atalho garantido para esse backend. [U3, R4]

Renderização offline de alta qualidade pode gerar imagens de apresentação, com custo separado, mas não substitui o modo interativo nem demonstra o comportamento entre quadros. A mesma versão de geometria e estado deve sustentar as duas saídas. Compressão, instancing e níveis de detalhe são decisões mensuráveis, sujeitas aos critérios de fidelidade. [R5–R6]

# Inspeção interação e paridade entre saídas
### Paridade semântica como contrato
SVG e malhas mostram os mesmos IDs, valores, comandos, eventos e snapshots. Equivalência não significa pixels idênticos: projeção, sombreado, transparência e capacidade de corte diferem. A comparação verifica se selecionar head-pulley destaca a mesma peça, se a leitura de rotação vem da mesma variável e se o evento de descarga ocorre no mesmo tick.

| Recurso | SVG técnico | Malhas GPU | Regra de degradação |
| --- | --- | --- | --- |
| Seleção e leitura por peça | Identificação por elemento ou grupo | Picking com mapeamento de instância | Preservar ID e descrição |
| Inspeção espacial | Vistas preparadas e modo 3D disponível | Órbita e profundidade contínuas | Declarar vistas limitadas |
| Corte | Ocultação ou construção específica | Clipping e tampas conforme implementação | Não simular corte não suportado |
| Materiais físicos | Convenção gráfica | PBR dentro das capacidades verificadas | Usar material técnico legível |
| Explosão | Deslocamento de apresentação | Mesmo deslocamento por montagem | Pausar e preservar estado |

### Estado de apresentação separado
ViewState guarda câmera, seleção, peças isoladas, plano de corte, intensidade de explosão e preferências de movimento. ModelState guarda a máquina. Salvar uma vista não altera o experimento. Explodir a montagem aplica deslocamentos adicionais ao renderer, mantendo as transformações físicas originais; retornar à montagem remove esses deslocamentos e restaura a mesma seleção.

Ao mudar de backend, transferir snapshot, seleção e controles compatíveis. Se a projeção ou o recurso não puder ser preservado, usar uma vista inicial documentada e comunicar a mudança. Não reiniciar a simulação silenciosamente. dispose precisa remover listeners, buffers e recursos de GPU; o teste de trocas repetidas detecta crescimento indevido de memória.

### Usabilidade como requisito de engenharia
Controles devem funcionar com toque e teclado, sem depender de hover. Foco e seleção permanecem perceptíveis em fundos claros e escuros. A alternativa estática descreve mecanismo, estado e limitações. Respeitar redução de movimento e permitir pausar efeitos; o usuário pode inspecionar um estado sem correr atrás de animações.

Revisar escala geral e detalhes ampliados. A vista geral pode parecer correta enquanto uma fixação, apoio ou sentido de rotação está errado. O protocolo de revisão inclui câmeras nomeadas, close-ups de interfaces críticas e estados de transição, além de uma apresentação atraente da máquina inteira.

# Orçamentos de desempenho e custo
### Separar produção execução e apresentação
Medir geração de código e assets, execução interativa e renderização offline em contas separadas. Registrar tokens, chamadas, tentativas, gasto real de API quando disponível, tempo de ferramentas e revisão humana. No navegador, registrar bytes transferidos, tempo até interação útil, memória, tempo de quadro, long tasks e latência dos comandos. O custo de produção não pode ser inferido do tamanho do bundle. [P1–P2]

| Perfil a medir | Objetivo inicial proposto | Critério que precisa de medição |
| --- | --- | --- |
| Desktop com GPU dedicada | Exploração completa a 60 quadros/s | Quadro de 16,7 ms com margem aprovada |
| Notebook com GPU integrada | Inspeção útil a 30 ou 60 quadros/s | Perfil escolhido por cena e dispositivo |
| Telefone de referência | Interação a 30 quadros/s ou fallback explícito | Quadro de 33,3 ms, temperatura e memória |
| Captura offline | Qualidade e resolução contratadas | Tempo por quadro, amostras e custo total |

Os valores acima são objetivos de projeto, não resultados nem promessa. Os aparelhos concretos ainda precisam ser escolhidos. Não impor o mesmo número de triângulos, sombras ou partículas a todos: custo depende de preenchimento de pixels, materiais, overdraw, draw calls e trabalho de CPU. Reduzir polígonos não resolve necessariamente um gargalo de transparência.

### Protocolo de medição proposto
Fixar commit, cena, snapshot inicial, seed, resolução, DPR, navegador, GPU e modo de energia. Medir carga fria e quente. Após aquecimento controlado, executar a mesma sequência de câmera, seleção, corte e comandos, repetindo para estimar variabilidade. Uma janela inicial de estudo de 120 s e um teste prolongado de 15 min podem revelar picos e aquecimento; ajustar a duração ao fenômeno observado.

Relatar mediana, p95 e p99 de tempo de quadro, pior pausa, latência e condições do ensaio. Registrar CPU e GPU separadamente quando a API e o dispositivo permitirem; valores indisponíveis não viram zero. Comparar baseline, variante e diferença com o mesmo roteiro. Um resultado de laboratório não comprova todos os telefones.

### Adaptação e limites
Reduzir primeiro efeitos, resolução, sombras e partículas de apresentação. Detalhes críticos permanecem disponíveis por inspeção localizada ou carregamento sob demanda. Nunca alterar dt, relações mecânicas ou inventário para manter FPS. O orçamento aprovado por perfil inclui limites e fallback, e só passa a ser critério de liberação após o piloto produzir dados.

# SKILL curta receitas e toolkit
### O que o modelo carrega em cada etapa
A SKILL principal deve começar escolhendo modo criativo ou fiel à referência. No modo fiel, proibir completar detalhes como fatos sem fonte; no criativo, preservar a liberdade editorial atual. Depois, rotear entradas, domínio, nível de evidência, ferramentas e condições de parada. Ela aponta para contratos e receitas em arquivos específicos. O agente lê apenas o necessário para a etapa atual e recebe diagnósticos estruturados, em vez de carregar um manual inteiro em cada chamada.

| Local proposto | Conteúdo | Exemplo |
| --- | --- | --- |
| SKILL.md | Roteamento e regras de evidência e aprovação | Escolher receita ou declarar domínio não coberto |
| contracts e tools | Schemas, compilador e verificadores gerais | Validação de unidade, IDs e replay |
| recipes/belt-bucket | Mecanismo, parâmetros, hipóteses e testes do domínio | Caminho da correia, carga e descarga |
| recipes/gear-pair | Relações, montagem e fixtures de engrenagens | Dentes, sentido e distância entre centros |
| scenes/bucket-elevator-demo | Configuração e evidências desta cena | Manifesto, câmeras e assets autorizados |

### Receita suficiente para reprodução
Cada receita define o que sabe representar, quais dados faltantes bloqueiam uma afirmação, parâmetros permitidos, unidades, dependências e testes obrigatórios. Inclui um exemplo mínimo válido, casos inválidos e resultados esperados. Ferramentas produzem relatórios estáveis com códigos de erro e caminhos para evidências. A explicação em linguagem natural acompanha esses dados, sem substituir sua execução.

A geração é guiada por compilação de configuração e montagem. Código novo é reservado a mecanismos ou recursos realmente ausentes. O agente não deve reescrever o motor para cada máquina. Um domínio novo pode reutilizar seleção, inspeção, materiais e relatório, mas precisa demonstrar suas relações físicas com seus próprios fixtures.

### Contexto progressivo sem perda de rigor
Na pesquisa, carregar o registro de fontes e a receita. Na geometria, carregar somente peças e interfaces em revisão. Na avaliação, carregar critérios, traços, capturas e diagnósticos relevantes. Um manifesto resume decisões, versões e dependências para que trocas de etapa não apaguem hipóteses. O manifesto versionado é a fonte de verdade do artefato.

A organização favorece agentes fortes primeiro. A comparação posterior com modelos menores deverá usar o mesmo conjunto de tarefas, ferramentas e critérios, medindo custo total de tentativas e revisão. Reduzir tokens antes de estabelecer a correção criaria um ganho aparente sem referência confiável de qualidade.

# Geração por agentes e crítica baseada em evidência
### Sequência com saídas verificáveis
O agente de pesquisa reúne referências e marca lacunas. O planejador escolhe receita, detalha a lista de peças e registra hipóteses. O construtor produz configuração, geometria e vínculos semânticos. Ferramentas executam validação, auditoria, replay, capturas e perfil. O crítico recebe requisitos e evidências para localizar divergências. Um revisor humano decide sobre fidelidade especializada, tolerâncias e promoção das afirmações.

Esses papéis não precisam ser serviços independentes. A separação importante é entre quem propõe uma solução, a evidência produzida por ferramentas e quem decide sua aceitação. Um agente pode criticar uma imagem, mas não pode aprovar sua própria fidelidade apenas porque a descrição parece convincente.

### Formato de uma crítica útil
Uma crítica contém criterionId, partId ou intervalo de ticks, expected, observed, evidencePath, severity e suggestedCheck. Exemplo: “KIN-02, head-pulley, ticks 120–240: a integral angular difere de Δs/r acima da tolerância; anexo trace.csv; verificar raio efetivo”. Outro exemplo: “GEO-07, bucket007: a fixação está ausente na vista detalhe A; fonte E12, figura 4; comparar montagem”. Uma nota de beleza sem referência não é critério técnico.

### Autoridade das evidências
Invariantes automatizados podem reprovar massa negativa, referência inexistente e perda de sincronismo. Uma captura pode comprovar o estado visual em uma câmera. Uma comparação geométrica pode quantificar desvio em superfícies observadas. Nenhum desses métodos, isoladamente, estabelece capacidade ou segurança. A revisão combina métodos conforme a afirmação e mantém “não avaliado” onde a evidência falta.

### Ciclo de correção limitado pelo defeito
Corrigir o menor conjunto de dados ou código que explique a divergência, repetir testes afetados e regressões relacionadas, e preservar o histórico do motivo. Não modificar a referência, tolerância ou baseline só para fazer o teste passar. Toda alteração nesses elementos recebe revisão separada. Falhas recorrentes ou fontes contraditórias interrompem a geração do detalhe e pedem decisão.

O relatório deve separar “ferramenta executada e resultado” de “recomendação do crítico”. Imagens de antes e depois, hashes e traços permitem revisão independente. A liberação exige evidência positiva dos requisitos críticos; ausência de erro no console ou consenso entre agentes não é suficiente.

# Harness de avaliação e falhas injetadas
### Estrutura do ensaio
Cada caso define fixture de máquina, estado inicial, sequência de comandos, câmeras, observáveis, tolerâncias e resultados esperados. O runner valida, compila, executa o modelo sem renderização, repete com cada backend e reúne traços e capturas. Cada check registra executado, ignorado ou parcial; auditOrExit sem --audit retorna null, não aprovação. Uma varredura operacional da receita é obrigatória, separada dos checks de explosão do upstream. Invariantes numéricos são comparados antes das imagens. Resultados são legíveis por pessoa e máquina e sempre identificam commit, ambiente e versão das referências.

| Falha injetada | Detector esperado | Resultado obrigatório |
| --- | --- | --- |
| Milímetros interpretados como metros | Escala e dimensões de referência | Reprovar importação |
| Eixo invertido ou range ignorado | Traço de sentido e limites | Reprovar cinemática |
| Massa removida sem destino | Balanço por evento e global | Reprovar no primeiro tick afetado |
| Caneca troca de ID ao fechar caminho | Continuidade e identidade | Reprovar vínculo de instância |
| Partículas reduzidas alteram vazão | Comparação entre perfis de render | Reprovar independência visual |
| Corte altera colisão ou inventário | Replay com e sem inspeção | Reprovar separação de estados |
| Asset modificado sem manifesto | Hash e proveniência | Reprovar empacotamento |
| Casco convexo fecha boca da caneca | Ensaio de entrada e seção do collider | Reprovar modelo de contato |

### Testes que se complementam
Testes unitários cobrem conversões, juntas e eventos. Testes de propriedade variam parâmetros dentro de faixas válidas e verificam conservação, limites e monotonicidade aplicável. Testes metamórficos conferem que mudar câmera, tema ou partículas não muda estado. Ensaios de convergência com dt e dt/2 avaliam observáveis e eventos; a tolerância depende do método e do fenômeno, não de um epsilon global.

Regressão visual usa imagens alinhadas em condições fixas e comparação por regiões. Antialiasing e diferenças de GPU exigem tolerâncias locais e revisão de mudanças. Um limiar de pixels não deve aceitar a falta de um fixador crítico porque ocupa pouca área. As auditorias upstream são verificações amostradas com exceções próprias. solidClearances pode omitir pares com deslocamento semelhante e tolerar contatos previstos; isso não aprova automaticamente a folga operacional. Registrar skipped e cobertura do domínio e acrescentar varredura ou verificação conservadora para interfaces críticas. [U4–U6]

### Critério para confiar no próprio harness
Injetar cada defeito conhecido e verificar que o detector falha pela causa esperada. Um teste que continua verde após inverter o sentido do tambor não valida cinemática. Guardar quais classes de falha a suíte detecta e quais permanecem abertas. Esta revisão especifica o ensaio; não afirma que ele já foi implementado ou executado.

# Exemplo completo da evidência ao teste
### Um caso pequeno com parâmetros ilustrativos
O recorte usa tambor com raio 0,20 m, correia a 0,50 m/s e uma caneca identificada como bucket007. A fonte E0 é “hipótese de demonstração”. O vínculo afirma ausência de escorregamento, portanto ω = v/r = 2,50 rad/s. O teste sintético de descarga transfere 0,20 kg entre dois compartimentos. Para fechar o caminho, escolher N = 20 e p = 0,25 m: L = 5,00 m. Com tambores iguais, L = 2C + 2πr dá C = 1,87168147 m; uma volta dura 10,00 s e passam duas canecas por segundo. O fechamento é algébrico, não uma aprovação de folgas ou capacidade. Nenhum desses números descreve uma máquina real identificada.

1. Evidência e contrato. E0 sustenta apenas o fixture. O validador confirma unidade, raio positivo, existência de peças e referência de material. O relatório permite F0 e não concede F1 dimensional. O frame de origem é o centro do tambor inferior; o centro superior usa C calculado.
2. Compilação. A receita cria caminho tangente, junta head-shaft, pose do tambor e instância bucket007. A malha e o elemento SVG recebem o mesmo partId. A geometria de auditoria conserva o raio e as interfaces críticas.
3. Estado. O replay aplica velocidade no tick combinado. Em 0,10 s de regime, a correia avança 0,05 m e o tambor 0,25 rad. Um evento transfere 0,20 kg da caneca para a descarga com soma nula.
4. Apresentação. SVG move a representação técnica; GPU aplica a pose à malha. As leituras de velocidade e massa vêm do snapshot. A densidade de partículas pode variar sem tocar o evento ou o inventário.
5. Avaliação. O runner compara traço angular, deslocamento, contabilidade e identificação entre saídas. Captura vista geral e close-up da fixação nos mesmos ticks. A revisão constata quais detalhes ainda são genéricos.

### Critérios concretos propostos
ACC-01 exige que o erro de Δângulo − Δs/r permaneça na tolerância numérica escolhida para o método. ACC-02 exige que toda transferência tenha origem, destino, quantidade e tick e conserve a massa. ACC-03 exige que selecionar bucket007 em qualquer backend retorne o mesmo registro. ACC-04 exige que mudar partículas e câmera preserve o hash do estado físico após o mesmo replay no ambiente fixado; entre ambientes, comparar valores dentro das tolerâncias. ACC-05 bloqueia afirmações dimensionais sem evidência além de E0. ACC-06 exige que a mesma caneca complete dez voltas sem trocar ID nem criar uma lacuna na emenda.

### Como o caso deve falhar
Alterar só o raio gráfico para 0,22 m deve produzir divergência entre geometria e contrato. Remover 0,20 kg sem adicionar ao destino deve falhar no balanço. Ligar o contador de vazão ao número de partículas deve falhar na comparação entre perfis. Aceitar essas falhas seria sinal de que o produto produz uma animação convincente sem demonstrar correspondência causal.

As evidências esperadas são validation.json, trace.csv, events.json, captures e report com status por critério. Esses nomes descrevem saídas futuras do toolkit, não arquivos de resultados já obtidos.

# Recorte vertical e prova de reutilização
### Primeiro percurso completo
O piloto deve atravessar todas as camadas com um único mecanismo limitado, antes de ampliar a biblioteca. Se cavidades, furos ou concavidades críticas ultrapassarem o SVG, antecipar um experimento de malhas. Não deformar a geometria da referência para fazer o adaptador passar. No elevador genérico, incluir estrutura de apoio, tambores, correia, canecas e sua fixação, alimentação, descarga e retorno. Implementar partida, regime e parada com inventário, seleção por peça e duas vistas de inspeção. Esta especificação define como o toolkit sustentará o benchmark genérico; a identificação de uma máquina real continua pendente.

| Etapa proposta | Evidência de saída | Condição para avançar |
| --- | --- | --- |
| Base e contrato | Baseline upstream e fixtures válidos e inválidos | Compatibilidade e unidades verificadas |
| Geometria e núcleo | Montagem, replay e contabilidade | Sem divergência crítica no recorte |
| SVG onde suportado | Interação, capturas e lacunas de capacidade | Estado e IDs preservados sem adulterar geometria |
| Adaptador de malhas | Capacidades e materiais mínimos | Paridade semântica e custo medidos |
| Revisão de referência | Matriz por detalhe e afirmação | Limitações aceitas e escopo assinado |
| Segunda receita | Outro mecanismo sem duplicar o núcleo | Reutilização demonstrada por testes |

### O que entra depois da primeira medição
Escolher biblioteca gráfica e perfil de dispositivos após um protótipo instrumentalizado. Adicionar material, iluminação e detalhe com comparação de benefício e custo. Trabalhar com uma referência real assim que houver dados autorizados; atualizar claims e repetir testes afetados. Estimativas de cronograma e orçamento pertencem ao plano de implementação, pois dependem da qualidade dos assets e da extensão das lacunas.

### Provar que é uma extensão modular
Uma segunda receita deve forçar uma diferença relevante, por exemplo um par de engrenagens com relação e sentido próprios ou um mecanismo biela manivela com fechamento geométrico. Ela reutiliza contrato, relógio, seleção, renderizadores e relatório, mas acrescenta suas equações e ensaios. O objetivo é identificar abstrações indevidamente específicas do elevador.

Esse teste de reutilização não seleciona um novo projeto do usuário nem autoriza construir outro equipamento. A escolha ocorre no plano aprovado. Não antecipar uma biblioteca extensa de máquinas, um editor CAD, telemetria, otimização de fábrica ou suporte amplo a modelos pequenos. O plano de implementação define tarefas verificáveis e critérios de parada para esse recorte.

# Riscos decisões e condições de aprovação
### Tradeoffs que precisam permanecer visíveis
| Risco ou escolha | Consequência | Tratamento proposto |
| --- | --- | --- |
| Referência incompleta | Detalhe inventado parece factual | Hipótese local e bloqueio da afirmação |
| Dois renderizadores | Custo de manutenção e divergência | Núcleo comum e testes de paridade |
| CAD pesado ou imperfeito | Carga lenta e auditoria enganosa | Derivados, validação e proveniência |
| Solver genérico cedo demais | Complexidade sem ganho verificável | Relações analíticas no recorte inicial |
| PBR antes de geometria | Aparência encobre erro de montagem | Material neutro e critérios críticos |
| Baselines aceitos sem revisão | Regressão se torna referência | Aprovação separada de mudanças |
| Contexto excessivo da SKILL | Geração inconsistente e custosa | Roteador curto e receitas sob demanda |

### Decisões arquiteturais
Adotar o núcleo semântico e comportamental compartilhado; preservar o caminho legado; usar evidência por afirmação; manter SVG e acrescentar um backend de malhas opcional; tratar a biblioteca gráfica como decisão condicionada ao piloto; começar por elevador genérico; e exigir testes negativos e revisão especializada antes de declarar fidelidade. Esses pontos delimitam a arquitetura e seus critérios de implementação.

### Informações ainda necessárias
Para paridade com uma unidade real: fabricante e modelo ou identificação equivalente, configuração, vistas e medidas, manual ou CAD autorizado, condições de operação e detalhes que o especialista considera críticos. Para desempenho: aparelhos e navegadores prioritários, modo de entrega e limite aceitável de espera. Para validação: observáveis, tolerâncias, pessoa responsável e dados de ensaio disponíveis.

Referências adicionais devem ser obtidas por acesso seguro e procedimentos de manutenção; não solicitar remoção de proteções ou aproximação de partes móveis para fotografar. A falta dessas informações não impede discutir ou planejar o toolkit genérico; impede afirmar correspondência real nos critérios dependentes. O resultado deve deixar claro onde termina a evidência. Não se exige um conjunto industrial completo para explicar um princípio, mas não se concede validação industrial a uma explicação.

# Registro de fontes e afirmações
As fontes abaixo sustentam fatos sobre o upstream, formatos, renderização e métodos. Contratos, nomes de módulos, perfis e critérios deste documento são propostas. Os exemplos numéricos são sintéticos. Consulta em 11 outubro 2026. O código upstream está fixado por commit para evitar que mudanças posteriores alterem silenciosamente a base da análise.

### Código upstream
[U1] Anatomy, README e SKILL no commit dbf697a527bbf7d358668e1557cb1e35ff725d46. Sustenta o escopo de skill, exemplos, SVG e modos opcionais. https://github.com/wheresryan22/anatomy/tree/dbf697a527bbf7d358668e1557cb1e35ff725d46

[U2] kit/iso-kit.mjs, iso-kit.ts, lathe.mjs e tube.mjs no mesmo commit. Sustenta os pontos de integração de geometria e composição descritos nas seções de base e arquitetura. https://github.com/wheresryan22/anatomy/tree/dbf697a527bbf7d358668e1557cb1e35ff725d46/kit

[U3] kit/turn-build.mjs, turn.mjs e references/3d.md. Sustenta grupos, montagem e runtime 3D existente. Não é fonte de uma API industrial pública. https://github.com/wheresryan22/anatomy/blob/dbf697a527bbf7d358668e1557cb1e35ff725d46/references/3d.md

[U4] kit/audit.mjs, turn-audit.mjs e scripts de verificação. Sustenta os tipos de auditoria reaproveitáveis e os limites da cobertura observada. https://github.com/wheresryan22/anatomy/blob/dbf697a527bbf7d358668e1557cb1e35ff725d46/kit/audit.mjs

[U5] Scripts, evals e CI. Escopo das verificações e reconstrução dos exemplos. https://github.com/wheresryan22/anatomy/tree/dbf697a527bbf7d358668e1557cb1e35ff725d46/scripts e https://github.com/wheresryan22/anatomy/blob/dbf697a527bbf7d358668e1557cb1e35ff725d46/.github/workflows/ci.yml

[U6] Quantização e defaults do auditor. turn-build.mjs, linhas 8–9 e 1237; audit.mjs, linhas 1082 e 1565. https://github.com/wheresryan22/anatomy/blob/dbf697a527bbf7d358668e1557cb1e35ff725d46/kit/turn-build.mjs#L8-L9 e arquivo audit de [U4].

### Proveniência e formatos
[S1] JSON Schema, referência oficial de objetos, referências e validação. Sustenta a escolha de um contrato validável; não define os campos propostos aqui. https://json-schema.org/understanding-json-schema/

[G1] Khronos, glTF 2.0 Specification. Sustenta estrutura de assets, materiais, nós e convenções do formato. https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

[G2] Open CASCADE, XDE e BRepMesh. Preservação de montagem, propriedades de validação e tesselação de CAD. https://occt3d.com/dev/doc/overview/html/occt_user_guides__xde.html e https://dev.opencascade.org/doc/overview/html/occt_user_guides__mesh.html

# Fontes técnicas e rastreabilidade
### Física validação e materiais
[M1] Rapier, Rigid body types, Colliders e Integration parameters. Limites de corpos cinemáticos, geometria de contato e passo temporal. https://rapier.rs/docs/user_guides/javascript/rigid_body_type/ e https://rapier.rs/docs/user_guides/javascript/colliders/ e https://rapier.rs/docs/user_guides/javascript/integration_parameters/

[M2] Chrono DEM Engine, artigo dos autores, e Altair EDEM, material calibration. Modelos de partículas e necessidade de caracterização e calibração. https://arxiv.org/abs/2311.04648 e https://help.altair.com/EDEM/topics/edem_calibration_kits/edem_calibration_kits_c.htm

[M3] KWS, Bucket Elevator Engineering Guide; 4B, Increasing Bucket Elevator Capacity. Relação entre configuração, velocidade, canecas e descarga. https://www.kwsmfg.com/engineering-guides/bucket-elevator/ e https://go4b.com/usa/technical-support/technical-papers/increasing-bucket-elevator-capacity.pdf

[M4] 4B, cálculo de capacidade. Relação ideal entre volume, espaçamento, velocidade e densidade a granel. https://www.go4b.com/USA/brochures/4B-Bucket-Elevator-Components-Catalog/HTML/62/

[V1] NASA, Standard for Models and Simulations e FAQ de modelagem. Distinção entre verificação, validação para uso pretendido e comunicação da credibilidade. Usado como referência metodológica; esta proposta não declara conformidade NASA. https://standards.nasa.gov/standard/NASA/NASA-STD-7009 e https://public.ksc.nasa.gov/mns/faq/

[V2] NIST Technical Note 1297, classificação dos componentes de incerteza. https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-2-classification-components-uncertainty

[R1] Khronos, glTF 2.0, materiais metallic roughness e texturas. Mesma especificação de [G1]. Sustenta a representação, não uma medição de materiais reais.

[R2] Three.js, Color Management. Espaços de cor de texturas, trabalho linear e saída. https://threejs.org/manual/pages/color-management.html

[R3] Three.js, PMREMGenerator e WebGLRenderer. Ambiente filtrado e configuração de renderização. https://threejs.org/docs/pages/PMREMGenerator.html e https://threejs.org/docs/pages/WebGLRenderer.html

[R4] Three.js, WebGPURenderer. Compatibilidade, limitações e diferenças em relação ao WebGLRenderer. https://threejs.org/manual/pages/webgpurenderer

[R5] Three.js, InstancedMesh e GLTFLoader. Instâncias e carregamento de assets e extensões. https://threejs.org/docs/pages/InstancedMesh.html e https://threejs.org/docs/pages/GLTFLoader.html

[R6] Three.js, KTX2Loader; Khronos glTF Validator. Texturas comprimidas e validação de formato, sem validar engenharia. https://threejs.org/docs/pages/KTX2Loader.html e https://github.com/KhronosGroup/glTF-Validator

[P1] W3C, Performance Timeline e User Timing. Instrumentação do navegador. https://www.w3.org/TR/performance-timeline/ e https://www.w3.org/TR/user-timing/

[P2] Khronos, timer query WebGL2; W3C, WebGPU. Medição opcional de GPU e limites de timing. https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/ e https://www.w3.org/TR/webgpu/

### Como ler o suporte das afirmações
As seções de integração usam U1–U6 para descrever o código existente e distinguem as novas interfaces. As seções de contrato e evidência usam S1 e G1–G2 para formatos. As seções de comportamento usam M1–M4 e V1–V2 para delimitar modelos e validade. Renderização e medição usam R1–R6 e P1–P2. Processo, receitas e ensaios são requisitos desta arquitetura, não capacidades já executadas.

Nenhuma fonte externa comprova que o toolkit proposto já existe, que os testes passaram ou que a cena coincide com uma máquina real. Esses resultados só poderão ser declarados depois de implementação, execução documentada e comparação com referências adequadas. O relatório de liberação futuro deve ligar cada critério às evidências efetivamente produzidas, e não apenas citar esta especificação.

## Complete-coverage requirements

The [accepted complete-coverage supplement](complete-coverage.md) preserves the full two-session checklist, ownership, execution gates and explicit deferrals. Checklist coverage is not implementation evidence.
