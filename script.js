// =========================================================================
// == ФИНАЛЬНАЯ ВЕРСИЯ SCRIPT.JS ДЛЯ РАБОТЫ С POLLINATIONS.AI ==
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    const addPromptBtn = document.getElementById('add-prompt-btn');
    const connectorSvg = document.getElementById('connector-svg');

    let blockIdCounter = 0;
    let connections = new Map();
    // Карта для хранения активных стриминговых соединений, чтобы их можно было прервать
    const activeEventSources = new Map();

    addPromptBtn.addEventListener('click', () => {
        createPromptBlock(20, 20);
    });

    // --- ФУНКЦИИ ХРАНЕНИЯ СОСТОЯНИЯ (без изменений) ---
    function saveState() {
        const blocks = [];
        document.querySelectorAll('.block').forEach(block => {
            const textarea = block.querySelector('textarea');
            const content = block.querySelector('.content');
            blocks.push({
                id: block.id,
                className: block.className,
                style: {
                    left: block.style.left,
                    top: block.style.top
                },
                value: textarea ? textarea.value : content.innerHTML,
                model: block.querySelector('.model-select')?.value
            });
        });
        const state = {
            blocks,
            connections: Array.from(connections.entries()),
            blockIdCounter
        };
        localStorage.setItem('workbenchState', JSON.stringify(state));
    }

    function loadState() {
        const state = JSON.parse(localStorage.getItem('workbenchState'));
        if (!state) return;

        blockIdCounter = state.blockIdCounter;
        connections = new Map(state.connections);

        state.blocks.forEach(blockData => {
            if (blockData.className.includes('prompt-block')) {
                createPromptBlock(parseInt(blockData.style.left), parseInt(blockData.style.top), blockData.value, blockData.id);
            } else {
                // При загрузке нужно найти, к какому промпту относится блок ответа
                let parentPromptId = null;
                for (const [promptId, responseIds] of connections.entries()) {
                    if (responseIds.includes(blockData.id)) {
                        parentPromptId = promptId;
                        break;
                    }
                }
                createResponseBlock(parseInt(blockData.style.left), parseInt(blockData.style.top), parentPromptId, blockData.id, blockData.model, blockData.value);
            }
        });
        updateConnectors();
    }


    // --- ФУНКЦИИ СОЗДАНИЯ БЛОКОВ (с одним исправлением) ---
    function createPromptBlock(x, y, initialText = '', id = null) {
        const blockId = id || `prompt-${blockIdCounter++}`;
        const block = document.createElement('div');
        block.className = 'block prompt-block';
        block.id = blockId;
        block.style.left = `${x}px`;
        block.style.top = `${y}px`;

        block.innerHTML = `
            <div class="block-header">Prompt <button class="delete-btn">X</button></div>
            <textarea placeholder="Enter your prompt here...">${initialText}</textarea>
            <div class="block-buttons">
                <button class="generate-btn">Generate</button>
                <button class="add-response-btn">+</button>
            </div>
        `;

        canvas.appendChild(block);
        attachPromptBlockListeners(block);
        makeDraggable(block);

        if (!connections.has(blockId)) {
            connections.set(blockId, []);
        }

        if (!id) {
            saveState();
        }
        return blockId;
    }

    function createResponseBlock(x, y, promptId, id = null, modelValue = null, contentHTML = '') {
        const blockId = id || `response-${blockIdCounter++}`;
        const block = document.createElement('div');
        block.className = 'block response-block';
        block.id = blockId;
        block.style.left = `${x}px`;
        block.style.top = `${y}px`;

        // *** ИСПРАВЛЕНИЕ: Отображаем имя модели как есть, без .split() ***
        block.innerHTML = `
            <div class="block-header">
                Response
                <button class="use-as-prompt-btn" title="Use as new prompt">→</button>
                <button class="delete-btn" title="Delete block">X</button>
            </div>
            <select class="model-select">
                ${models.map(model => `<option value="${model}" ${model === modelValue ? 'selected' : ''}>${model}</option>`).join('')}
            </select>
            <div class="content">${contentHTML}</div>
        `;

        canvas.appendChild(block);
        attachResponseBlockListeners(block);
        makeDraggable(block);

        if (promptId && !id) {
            const promptConnections = connections.get(promptId) || [];
            promptConnections.push(blockId);
            connections.set(promptId, promptConnections);
            saveState();
        }
        updateConnectors();
    }


    // --- СЛУШАТЕЛИ СОБЫТИЙ (с новой логикой для Pollinations.AI) ---
    function attachPromptBlockListeners(block) {
        block.querySelector('.delete-btn').addEventListener('click', () => {
            const responseIds = connections.get(block.id) || [];
            responseIds.forEach(resId => {
                document.getElementById(resId)?.remove();
            });
            block.remove();
            connections.delete(block.id);
            if (activeEventSources.has(block.id)) {
                activeEventSources.get(block.id).close();
                activeEventSources.delete(block.id);
            }
            saveState();
            updateConnectors();
        });

        block.querySelector('.add-response-btn').addEventListener('click', () => {
            const promptRect = block.getBoundingClientRect();
            const x = promptRect.right - canvas.getBoundingClientRect().left + 20;
            const y = promptRect.top - canvas.getBoundingClientRect().top;
            createResponseBlock(x, y, block.id);
        });

        // *** НОВАЯ ЛОГИКА ГЕНЕРАЦИИ ***
        block.querySelector('.generate-btn').addEventListener('click', () => {
            const prompt = block.querySelector('textarea').value;
            if (!prompt) return;

             const responseBlockIds = connections.get(block.id) || [];
            if (responseBlockIds.length === 0) return;

            const responseBlockIds = connections.get(block.id) || [];
            if (responseBlockIds.length === 0) return;

            for (const responseBlockId of responseBlockIds) {
                const responseBlock = document.getElementById(responseBlockId);
                const model = responseBlock.querySelector('.model-select').value;
                const contentDiv = responseBlock.querySelector('.content');

                contentDiv.innerHTML = '<div class="spinner"></div>';
                
                const encodedPrompt = encodeURIComponent(prompt);
                
                // *** КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: URL с токеном для прямого запроса ***
                const apiToken = 'wp3Tk2C7coE2UGIm'; // ВАШ ТОКЕН ЗДЕСЬ
                const url = `https://text.pollinations.ai/${encodedPrompt}?model=${model}&stream=true&token=${apiToken}`;

                const eventSource = new EventSource(url);
                activeEventSources.get(block.id).push(eventSource);

                let isFirstChunk = true;

                eventSource.onmessage = (event) => {
                    if (isFirstChunk) {
                        contentDiv.innerHTML = ''; // Убираем спиннер
                        isFirstChunk = false;
                    }
                    if (event.data) {
                        try {
                           // API может слать JSON или просто текст
                           const data = JSON.parse(event.data);
                           contentDiv.textContent += data.text || '';
                        } catch {
                           // Если не JSON, просто добавляем как текст
                           if (event.data !== '[DONE]') {
                                contentDiv.textContent += event.data;
                           }
                        }
                    }
                };

                eventSource.onerror = (err) => {
                    if (isFirstChunk) {
                        contentDiv.innerHTML = 'Error: Could not connect. Check console for details.';
                    }
                    console.error("EventSource for " + model + " failed:", err);
                    eventSource.close();
                };
            }
            saveState(); // Сохраняем введенный промпт
        });

        block.querySelector('textarea').addEventListener('input', saveState);
    }

    function attachResponseBlockListeners(block) {
        block.querySelector('.delete-btn').addEventListener('click', () => {
            block.remove();
            for (const responseIds of connections.values()) {
                const index = responseIds.indexOf(block.id);
                if (index > -1) {
                    responseIds.splice(index, 1);
                }
            }
            saveState();
            updateConnectors();
        });

        block.querySelector('.use-as-prompt-btn').addEventListener('click', () => {
            const newPromptText = block.querySelector('.content').innerText;
            const responseRect = block.getBoundingClientRect();
            const x = responseRect.right - canvas.getBoundingClientRect().left + 40;
            const y = responseRect.top - canvas.getBoundingClientRect().top;
            createPromptBlock(x, y, newPromptText);
        });

        block.querySelector('.model-select').addEventListener('change', saveState);
    }

    // --- ОСТАЛЬНЫЕ ФУНКЦИИ (без изменений) ---
    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const header = element.querySelector('.block-header');
        if (header) {
            header.onmousedown = dragMouseDown;
        }

        function dragMouseDown(e) {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            updateConnectors();
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            saveState();
        }
    }

    function updateConnectors() {
        connectorSvg.innerHTML = '';
        for (const [promptId, responseIds] of connections.entries()) {
            const promptBlock = document.getElementById(promptId);
            if (!promptBlock) continue;

            const promptRect = promptBlock.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            const promptX = promptRect.left + promptRect.width - canvasRect.left;
            const promptY = promptRect.top + promptRect.height / 2 - canvasRect.top;

            for (const responseId of responseIds) {
                const responseBlock = document.getElementById(responseId);
                if (!responseBlock) continue;
                const responseRect = responseBlock.getBoundingClientRect();
                const responseX = responseRect.left - canvasRect.left;
                const responseY = responseRect.top + responseRect.height / 2 - canvasRect.top;

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', promptX);
                line.setAttribute('y1', promptY);
                line.setAttribute('x2', responseX);
                line.setAttribute('y2', responseY);
                connectorSvg.appendChild(line);
            }
        }
    }

    // --- Шаблоны и Персоны (без изменений) ---
    // ... ваш код для templates и personas ...
    const templates = [
        {
            name: 'SWOT Analysis',
            config: {
                prompt: {
                    text: 'Perform a SWOT analysis for [topic]',
                    responses: ['Strengths', 'Weaknesses', 'Opportunities', 'Threats']
                }
            }
        }
    ];

    const templatesList = document.getElementById('templates-list');
    templates.forEach(template => {
        const li = document.createElement('li');
        li.textContent = template.name;
        li.addEventListener('click', () => {
            const promptBlockId = createPromptBlock(20, 20, template.config.prompt.text);
            const promptBlock = document.getElementById(promptBlockId);
            const promptRect = promptBlock.getBoundingClientRect();
            template.config.prompt.responses.forEach((responseText, index) => {
                 const x = promptRect.right - canvas.getBoundingClientRect().left + 20;
                 const y = promptRect.top - canvas.getBoundingClientRect().top + (index * 150);
                 createResponseBlock(x, y, promptBlockId, null, null, responseText);
            });
        });
        templatesList.appendChild(li);
    });

    const personas = [
        { name: 'Python Expert', prompt: 'You are an expert Python developer.' },
        { name: 'JavaScript Expert', prompt: 'You are an expert JavaScript developer.' },
        { name: 'SQL Expert', prompt: 'You are an expert SQL developer.' },
    ];

    const personasList = document.getElementById('personas-list');
    personas.forEach(persona => {
        const li = document.createElement('li');
        li.textContent = persona.name;
        li.addEventListener('click', () => {
            const activeBlock = document.querySelector('.block.active.prompt-block');
            if (activeBlock) {
                const textarea = activeBlock.querySelector('textarea');
                // Добавляем персону в начало, если ее еще нет
                if (!textarea.value.startsWith(persona.prompt)) {
                    textarea.value = persona.prompt + '\n\n' + textarea.value;
                    saveState();
                }
            } else {
                alert("Please select a prompt block first to apply a persona.");
            }
        });
        personasList.appendChild(li);
    });

    document.addEventListener('click', (e) => {
        document.querySelectorAll('.block').forEach(b => b.classList.remove('active'));
        if (e.target.closest('.block')) {
            e.target.closest('.block').classList.add('active');
        }
    });

    loadState();
});
