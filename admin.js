// VERSÃO FINAL, COMPLETA E VERIFICADA
document.addEventListener('DOMContentLoaded', () => {
    // --- 1. INICIALIZAÇÃO E CONFIGURAÇÃO DO FIREBASE ---
    if (!firebase.apps.length) { 
        try {
            firebase.initializeApp(config.firebaseConfig);
        } catch (e) {
            console.error("Falha ao inicializar o Firebase:", e);
            alert("Erro crítico de configuração. O painel não pode ser carregado.");
            return;
        }
    }
    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- 2. SELETORES DE ELEMENTOS GLOBAIS ---
    const loadingScreen = document.getElementById('loading-screen');
    const loginSection = document.getElementById('login-section');
    const adminDashboard = document.getElementById('admin-dashboard');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    let dynamicConfig = {};

    // --- 3. LÓGICA DE AUTENTICAÇÃO E CONTROLE DE FLUXO ---
    auth.onAuthStateChanged(async (user) => {
        if (user && !user.isAnonymous) {
            await loadDynamicConfig();
            initAdminPanel();
            loginSection.classList.add('hidden');
            adminDashboard.classList.remove('hidden');
        } else {
            loginSection.classList.remove('hidden');
            adminDashboard.classList.add('hidden');
        }
        loadingScreen.classList.add('hidden');
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;
        loginError.textContent = '';

        auth.signInWithEmailAndPassword(email, password)
            .catch(error => {
                console.error("Erro de autenticação:", error.code, error.message);
                switch (error.code) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                    case 'auth/invalid-credential':
                        loginError.textContent = 'Email ou senha inválidos.';
                        break;
                    default:
                        loginError.textContent = 'Ocorreu um erro. Tente novamente.';
                        break;
                }
            });
    });

    // --- 4. FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO DO PAINEL ---
    function initAdminPanel() {
        const logoutButton = document.getElementById('logout-button');
        const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
        const sections = document.querySelectorAll('.dashboard-section');

        logoutButton.addEventListener('click', () => auth.signOut());

        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                menuItems.forEach(i => i.classList.remove('active'));
                sections.forEach(s => s.classList.remove('active-section'));
                item.classList.add('active');
                const sectionId = item.dataset.section;
                document.getElementById(sectionId).classList.add('active-section');
            });
        });

        loadDashboardData();
        setupAgendaSection();
        setupClientesSection();
        setupFinanceiroSection();
        setupConfiguracoesSection();
        setupServicosSection();
        setupRelatoriosSection();
    }

    // --- 5. FUNÇÕES DE CARREGAMENTO E MÓDULOS ---
    async function loadDynamicConfig() {
        try {
            const doc = await db.collection('configuracoes').doc('geral').get();
            if (doc.exists) {
                dynamicConfig = doc.data();
            } else {
                console.warn("Documento de configurações 'geral' não encontrado.");
                dynamicConfig = {}; 
            }
        } catch (error) {
            console.error("Erro ao carregar configurações dinâmicas:", error);
            alert("Não foi possível carregar as configurações do sistema.");
        }
    }

    async function loadDashboardData() {
        const today = new Date().toISOString().split('T')[0];
        const statAgendamentos = document.getElementById('stat-agendamentos-hoje');
        const statFaturamento = document.getElementById('stat-faturamento-dia');
        const proximosList = document.getElementById('proximos-agendamentos-list');

        try {
            const snapshot = await db.collection('agendamentos').where('data', '>=', today).orderBy('data').orderBy('horario').limit(5).get();
            const todaySnapshot = await db.collection('agendamentos').where('data', '==', today).get();
            
            let faturamentoDia = 0;
            todaySnapshot.forEach(doc => {
                if (doc.data().servicoPreco && !doc.data().isBlock) {
                    faturamentoDia += parseFloat(doc.data().servicoPreco.replace(',', '.')) || 0;
                }
            });
            const agendamentosReaisHoje = todaySnapshot.docs.filter(doc => !doc.data().isBlock);
            statAgendamentos.textContent = agendamentosReaisHoje.length;
            statFaturamento.textContent = faturamentoDia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            proximosList.innerHTML = '';
            const agendamentosReaisFuturos = snapshot.docs.filter(doc => !doc.data().isBlock);
            if (agendamentosReaisFuturos.length === 0) {
                proximosList.innerHTML = '<p>Nenhum agendamento futuro.</p>';
            } else {
                agendamentosReaisFuturos.forEach(doc => {
                    const app = doc.data();
                    const card = document.createElement('div');
                    card.className = 'appointment-card';
                    const formattedDate = new Date(app.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    card.innerHTML = `
                        <div class="appointment-time-block"><div class="time">${app.horario}</div><div class="date">${formattedDate}</div></div>
                        <div class="appointment-details-block">
                            <div class="info"><strong class="client-name">${app.nomeCliente}</strong><span class="service-name">${app.servicoNome}</span></div>
                            <div class="actions">
                                <button class="profile-btn" data-phone="${app.telefoneCliente}" data-name="${app.nomeCliente}" title="Ver Perfil do Cliente"><i class="fas fa-user"></i></button>
                                <button class="delete-btn" data-id="${doc.id}" title="Excluir Agendamento"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>`;
                    proximosList.appendChild(card);
                });
                proximosList.querySelectorAll('.delete-btn').forEach(button => button.addEventListener('click', (e) => {
                    const id = e.currentTarget.dataset.id;
                    if (confirm('Tem certeza que deseja excluir este agendamento?')) {
                        db.collection('agendamentos').doc(id).delete().then(() => {
                            loadDashboardData();
                            if (document.getElementById('agenda-section').classList.contains('active-section')) {
                                loadAgendaGrid(document.getElementById('agenda-date-picker').value);
                            }
                        });
                    }
                }));
                proximosList.querySelectorAll('.profile-btn').forEach(button => button.addEventListener('click', (e) => {
                    const target = e.currentTarget;
                    initClientProfileModal(db, target.dataset.phone, target.dataset.name, false, loadClientList);
                }));
            }
            loadLembretes(todaySnapshot);
        } catch (error) {
            console.error("Erro ao carregar dados do dashboard:", error);
        }
    }

    function loadLembretes(todaySnapshot) {
        const lembretesList = document.getElementById('lembretes-list');
        lembretesList.innerHTML = '';
        const agora = new Date();
        const agendamentosDeHojeParaLembrar = [];
        todaySnapshot.forEach(doc => {
            const agendamento = { id: doc.id, ...doc.data() };
            if (!agendamento.isBlock) {
                const horarioAgendamento = new Date(`${agendamento.data}T${agendamento.horario}`);
                if (horarioAgendamento > agora) {
                    agendamentosDeHojeParaLembrar.push(agendamento);
                }
            }
        });
        agendamentosDeHojeParaLembrar.sort((a, b) => a.horario.localeCompare(b.horario));
        if (agendamentosDeHojeParaLembrar.length === 0) {
            lembretesList.innerHTML = '<p>Nenhum agendamento hoje precisa de lembrete no momento.</p>';
            return;
        }
        agendamentosDeHojeParaLembrar.forEach(app => {
            const card = document.createElement('div');
            card.className = 'appointment-card';
            const mensagem = `Olá, ${app.nomeCliente}! Apenas para lembrar do seu agendamento na ${config.nomeBarbearia} hoje às ${app.horario}. Até logo!`;
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${app.telefoneCliente}&text=${encodeURIComponent(mensagem)}`;
            card.innerHTML = `
                <div class="appointment-time-block"><div class="time">${app.horario}</div></div>
                <div class="appointment-details-block">
                    <div class="info"><strong class="client-name">${app.nomeCliente}</strong><span class="service-name">${app.servicoNome}</span></div>
                    <div class="actions"><a href="${whatsappUrl}" target="_blank" class="reminder-btn" title="Enviar lembrete via WhatsApp"><i class="fab fa-whatsapp"></i></a></div>
                </div>`;
            lembretesList.appendChild(card);
        });
    }

    function getHorariosDoDia(dataSelecionada) {
        const diaSemana = new Date(dataSelecionada + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long' }).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace('-feira', '');
        if (dynamicConfig.horarios && dynamicConfig.horarios[diaSemana]) {
            const horarioDia = dynamicConfig.horarios[diaSemana];
            if (horarioDia.aberto) {
                return { inicio: horarioDia.inicio, fim: horarioDia.fim };
            }
        }
        return null;
    }

// FIM DA PARTE 1 DE 3
// INÍCIO DA PARTE 2 DE 3

    function setupAgendaSection() {
        const datePicker = document.getElementById('agenda-date-picker');
        datePicker.value = new Date().toISOString().split('T')[0];
        
        loadAgendaGrid(datePicker.value);
        
        datePicker.addEventListener('change', () => loadAgendaGrid(datePicker.value));
        
        document.getElementById('add-appointment-btn').addEventListener('click', () => {
            initManualBookingModal(db, datePicker.value, () => loadAgendaGrid(datePicker.value));
        });
    }

    async function loadAgendaGrid(selectedDate) {
        const container = document.getElementById('agenda-grid-container');
        container.innerHTML = '<div class="loading-spinner"></div>';

        const horariosDoDia = getHorariosDoDia(selectedDate);
        if (!horariosDoDia || (dynamicConfig.diasBloqueados && dynamicConfig.diasBloqueados.includes(selectedDate))) {
            container.innerHTML = '<p>A barbearia está fechada neste dia.</p>';
            return;
        }

        const inicio = new Date(`${selectedDate}T${horariosDoDia.inicio}`);
        const fim = new Date(`${selectedDate}T${horariosDoDia.fim}`);
        
        const agendamentosSnapshot = await db.collection('agendamentos').where('data', '==', selectedDate).get();
        const agendamentosDoDia = agendamentosSnapshot.docs.map(doc => {
            const data = doc.data();
            const duracao = parseInt(data.duracao, 10) || config.intervaloMinutos;
            return { id: doc.id, ...data, duracao: duracao };
        });

        container.innerHTML = '';
        let horarioAtual = new Date(inicio.getTime());

        while (horarioAtual < fim) {
            const timeStr = horarioAtual.toTimeString().substring(0, 5);
            let slotOcupado = false;

            for (const agendamento of agendamentosDoDia) {
                const agendamentoInicio = new Date(`${selectedDate}T${agendamento.horario}`);
                const agendamentoFim = new Date(agendamentoInicio.getTime() + agendamento.duracao * 60000);

                if (horarioAtual >= agendamentoInicio && horarioAtual < agendamentoFim) {
                    if (horarioAtual.getTime() === agendamentoInicio.getTime()) {
                        const slotDiv = document.createElement('div');
                        slotDiv.className = 'time-slot';
                        const docId = agendamento.id;

                        if (agendamento.isBlock) {
                            slotDiv.innerHTML = `<div class="time-label">${timeStr}</div><div class="blocked-slot" data-id="${docId}">Bloqueado</div>`;
                            slotDiv.addEventListener('click', (e) => showActionMenu(e.currentTarget, 'blocked', selectedDate, timeStr, docId));
                        } else {
                            slotDiv.innerHTML = `<div class="time-label">${timeStr}</div><div class="appointment-block" data-id="${docId}"><strong>${agendamento.nomeCliente}</strong><span>${agendamento.servicoNome}</span></div>`;
                            slotDiv.addEventListener('click', (e) => showActionMenu(e.currentTarget, 'appointment', selectedDate, timeStr, docId));
                        }
                        container.appendChild(slotDiv);
                    }
                    slotOcupado = true;
                    break; 
                }
            }

            if (!slotOcupado) {
                const slotDiv = document.createElement('div');
                slotDiv.className = 'time-slot';
                slotDiv.innerHTML = `<div class="time-label">${timeStr}</div><div class="empty-slot" data-time="${timeStr}">Vago</div>`;
                slotDiv.addEventListener('click', (e) => showActionMenu(e.currentTarget, 'empty', selectedDate, timeStr));
                container.appendChild(slotDiv);
            }

            horarioAtual.setMinutes(horarioAtual.getMinutes() + config.intervaloMinutos);
        }
    }

    async function toggleBlockTime(date, time) {
        const docId = `${date}_${time}`;
        const docRef = db.collection('agendamentos').doc(docId);
        try {
            const doc = await docRef.get();
            if (doc.exists && doc.data().isBlock) {
                await docRef.delete();
            } else if (!doc.exists) {
                await docRef.set({ data: date, horario: time, isBlock: true, servicoNome: "Bloqueado pelo Administrador", duracao: config.intervaloMinutos, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
            } else {
                alert("Não é possível bloquear um horário que já foi agendado por um cliente.");
            }
            loadAgendaGrid(date);
            loadDashboardData();
        } catch (error) {
            console.error("Erro ao tentar bloquear/desbloquear horário:", error);
            alert("Ocorreu um erro. Tente novamente.");
        }
    }
    
    function showActionMenu(slotElement, type, date, time, docId = null) {
        const existingMenu = document.querySelector('.slot-action-menu');
        if (existingMenu) existingMenu.remove();
        
        const menu = document.createElement('div');
        menu.className = 'slot-action-menu';
        let menuContent = '';
        switch (type) {
            case 'empty': menuContent = `<button data-action="book"><i class="fas fa-plus"></i> Agendar</button><button data-action="block"><i class="fas fa-lock"></i> Bloquear</button>`; break;
            case 'blocked': menuContent = `<button data-action="unblock"><i class="fas fa-unlock"></i> Desbloquear</button>`; break;
            case 'appointment': menuContent = `<button data-action="delete"><i class="fas fa-trash"></i> Excluir</button>`; break;
        }
        menu.innerHTML = menuContent;
        slotElement.appendChild(menu);

        menu.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = e.target.closest('button')?.dataset.action;
            if (action) {
                switch (action) {
                    case 'book': initManualBookingModal(db, date, () => loadAgendaGrid(date), time); break;
                    case 'block': if (confirm(`Deseja bloquear o horário das ${time}?`)) toggleBlockTime(date, time); break;
                    case 'unblock': if (confirm('Deseja desbloquear este horário?')) toggleBlockTime(date, time); break;
                    case 'delete': if (confirm('Tem certeza que deseja excluir este agendamento?')) { db.collection('agendamentos').doc(docId).delete().then(() => { loadAgendaGrid(date); loadDashboardData(); }); } break;
                }
                menu.remove();
            }
        });
        setTimeout(() => { document.addEventListener('click', () => menu.remove(), { once: true }); }, 0);
    }

    function setupClientesSection() {
        loadClientList();
        document.getElementById('add-new-client-btn').addEventListener('click', () => initClientProfileModal(db, '', '', true, loadClientList));
        document.getElementById('client-search-input').addEventListener('input', filterClients);
    }

    async function loadClientList() {
        const container = document.getElementById('client-manager-list');
        container.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const snapshot = await db.collection('Clientes').orderBy('nome').get();
            container.innerHTML = '';
            if (snapshot.empty) { container.innerHTML = '<p>Nenhum cliente cadastrado.</p>'; return; }
            snapshot.forEach(doc => {
                const client = doc.data();
                const itemDiv = document.createElement('div');
                itemDiv.className = 'client-list-item';
                itemDiv.dataset.phone = client.telefone;
                itemDiv.dataset.name = client.nome;
                itemDiv.innerHTML = `<div><strong>${client.nome}</strong><span>${client.telefone.replace('55', '')}</span></div><i class="fas fa-chevron-right"></i>`;
                itemDiv.addEventListener('click', () => initClientProfileModal(db, client.telefone, client.nome, false, loadClientList));
                container.appendChild(itemDiv);
            });
        } catch (error) {
            console.error("Erro ao carregar lista de clientes:", error);
            container.innerHTML = '<p>Erro ao carregar clientes.</p>';
        }
    }

    function filterClients(e) {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#client-manager-list .client-list-item').forEach(item => {
            const clientName = item.dataset.name.toLowerCase();
            item.style.display = clientName.includes(term) ? 'flex' : 'none';
        });
    }

// FIM DA PARTE 2 DE 3
// INÍCIO DA PARTE 3 DE 3

    let revenueChartInstance = null;
    function setupFinanceiroSection() {
        document.getElementById('calculate-revenue-btn').addEventListener('click', calculateAndShowRevenue);
        loadMonthlyRevenueChart();
    }

    async function calculateAndShowRevenue() {
        const start = document.getElementById('start-date').value;
        const end = document.getElementById('end-date').value;
        if (!start || !end) { alert('Selecione as datas de início e fim.'); return; }
        
        const resultDiv = document.getElementById('revenue-result');
        resultDiv.classList.remove('hidden');
        resultDiv.innerHTML = '<div class="loading-spinner"></div>';
        try {
            const snapshot = await db.collection('agendamentos').where('data', '>=', start).where('data', '<=', end).get();
            let total = 0;
            snapshot.forEach(doc => {
                if (doc.data().servicoPreco && !doc.data().isBlock) {
                    total += parseFloat(doc.data().servicoPreco.replace(',', '.')) || 0;
                }
            });
            resultDiv.innerHTML = `<h3>Faturamento Total: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</h3>`;
        } catch (error) {
            console.error("Erro ao calcular faturamento:", error);
            resultDiv.innerHTML = '<h3>Erro ao gerar relatório.</h3>';
        }
    }

    async function loadMonthlyRevenueChart() {
        const ctx = document.getElementById('revenue-chart').getContext('2d');
        const labels = [];
        const data = [];
        try {
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const monthName = d.toLocaleString('pt-BR', { month: 'long' });
                labels.push(monthName.charAt(0).toUpperCase() + monthName.slice(1));
                
                const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
                const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
                const snapshot = await db.collection('agendamentos').where('data', '>=', startOfMonth).where('data', '<=', endOfMonth).get();
                let totalMes = 0;
                snapshot.forEach(doc => {
                    if (doc.data().servicoPreco && !doc.data().isBlock) {
                        totalMes += parseFloat(doc.data().servicoPreco.replace(',', '.')) || 0;
                    }
                });
                data.push(totalMes);
            }
            if (revenueChartInstance) revenueChartInstance.destroy();
            revenueChartInstance = new Chart(ctx, {
                type: 'bar',
                data: { labels, datasets: [{ label: 'Faturamento Mensal', data, backgroundColor: 'rgba(197, 164, 126, 0.8)', borderColor: 'rgba(197, 164, 126, 1)', borderWidth: 1 }] },
                options: { responsive: true, scales: { y: { beginAtZero: true } } }
            });
        } catch (error) {
            console.error("Erro ao carregar gráfico mensal:", error);
        }
    }
    
    function setupConfiguracoesSection() {
        const form = document.getElementById('settings-form');
        populateSettingsForm();
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveButton = form.querySelector('button[type="submit"]');
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            
            try {
                const newConfig = {
                    antecedenciaMinutos: parseInt(document.getElementById('antecedencia-minutos').value, 10) || 60,
                    telefoneWhatsapp: document.getElementById('whatsapp-notifications').value,
                    diasBloqueados: dynamicConfig.diasBloqueados || [],
                    horarios: {}
                };
                const dias = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
                dias.forEach(dia => {
                    newConfig.horarios[dia] = {
                        aberto: document.getElementById(`toggle-${dia}`).checked,
                        inicio: document.getElementById(`inicio-${dia}`).value,
                        fim: document.getElementById(`fim-${dia}`).value
                    };
                });
                await db.collection('configuracoes').doc('geral').set(newConfig, { merge: true });
                await loadDynamicConfig();
                alert("Configurações salvas com sucesso!");
            } catch (error) {
                console.error("Erro ao salvar configurações:", error);
                alert("Não foi possível salvar as configurações.");
            } finally {
                saveButton.disabled = false;
                saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar Alterações';
            }
        });

        document.getElementById('block-date-picker').addEventListener('change', async (e) => {
            const dateToToggle = e.target.value;
            if (!dateToToggle) return;
            
            let currentBlockedDates = dynamicConfig.diasBloqueados || [];
            if (currentBlockedDates.includes(dateToToggle)) {
                currentBlockedDates = currentBlockedDates.filter(d => d !== dateToToggle);
            } else {
                currentBlockedDates.push(dateToToggle);
            }
            
            try {
                await db.collection('configuracoes').doc('geral').update({ diasBloqueados: currentBlockedDates });
                await loadDynamicConfig();
                populateBlockedDates();
                e.target.value = '';
            } catch (error) { console.error("Erro ao atualizar data bloqueada:", error); }
        });
    }

    function populateSettingsForm() {
        document.getElementById('antecedencia-minutos').value = dynamicConfig.antecedenciaMinutos || 60;
        document.getElementById('whatsapp-notifications').value = dynamicConfig.telefoneWhatsapp || '';
        const container = document.getElementById('horarios-config-container');
        container.innerHTML = '';
        const dias = { segunda: "Segunda-feira", terca: "Terça-feira", quarta: "Quarta-feira", quinta: "Quinta-feira", sexta: "Sexta-feira", sabado: "Sábado", domingo: "Domingo" };
        
        for (const [key, value] of Object.entries(dias)) {
            const horario = (dynamicConfig.horarios && dynamicConfig.horarios[key]) ? dynamicConfig.horarios[key] : { aberto: false, inicio: '09:00', fim: '18:00' };
            const item = document.createElement('div');
            item.className = 'horario-dia-item';
            item.innerHTML = `
                <div class="dia-header"><strong>${value}</strong>
                    <div class="toggle-switch"><span>Fechado</span><input type="checkbox" id="toggle-${key}" ${horario.aberto ? 'checked' : ''}><label for="toggle-${key}"></label><span>Aberto</span></div>
                </div>
                <div class="horarios-inputs ${!horario.aberto ? 'disabled' : ''}">
                    <input type="time" id="inicio-${key}" class="input-field" value="${horario.inicio}"><span>às</span><input type="time" id="fim-${key}" class="input-field" value="${horario.fim}">
                </div>`;
            container.appendChild(item);
            const toggle = item.querySelector(`#toggle-${key}`);
            toggle.addEventListener('change', () => item.querySelector('.horarios-inputs').classList.toggle('disabled', !toggle.checked));
        }
        populateBlockedDates();
    }

    function populateBlockedDates() {
        const container = document.getElementById('blocked-dates-list');
        container.innerHTML = '';
        const blockedDates = dynamicConfig.diasBloqueados || [];
        if (blockedDates.length === 0) { container.innerHTML = '<p>Nenhum dia bloqueado.</p>'; return; }
        
        blockedDates.sort().forEach(date => {
            const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR');
            const tag = document.createElement('div');
            tag.className = 'blocked-date-tag';
            tag.innerHTML = `<span>${formattedDate}</span><button data-date="${date}" title="Desbloquear dia">&times;</button>`;
            container.appendChild(tag);
            tag.querySelector('button').addEventListener('click', async (e) => {
                const dateToUnblock = e.currentTarget.dataset.date;
                try {
                    await db.collection('configuracoes').doc('geral').update({ diasBloqueados: firebase.firestore.FieldValue.arrayRemove(dateToUnblock) });
                    await loadDynamicConfig();
                    populateBlockedDates();
                } catch (error) { console.error("Erro ao desbloquear data:", error); }
            });
        });
    }

    async function initManualBookingModal(db, selectedDate, onSaveCallback, preselectedTime = null) {
        const modal = document.getElementById('modal-backdrop');
        const form = document.getElementById('manual-booking-form');
        form.reset();
        const servicePicker = document.getElementById('manual-service-picker');
        const timePicker = document.getElementById('manual-time-picker');
        servicePicker.innerHTML = '<option value="" disabled selected>Carregando serviços...</option>';
        timePicker.innerHTML = '<option value="" disabled selected>Selecione um horário</option>';
        timePicker.disabled = true;
        let servicosDoBanco = [];
        try {
            const snapshot = await db.collection('servicos').orderBy('nome').get();
            snapshot.forEach(doc => servicosDoBanco.push({ id: doc.id, ...doc.data() }));
            servicePicker.innerHTML = '<option value="" disabled selected>Selecione um serviço</option>';
            servicosDoBanco.forEach((service, index) => {
                servicePicker.innerHTML += `<option value="${index}">${service.nome}</option>`;
            });
        } catch (error) {
            console.error("Erro ao carregar serviços no modal:", error);
            servicePicker.innerHTML = '<option value="">Erro ao carregar</option>';
        }
        servicePicker.onchange = async () => {
            timePicker.disabled = false;
            timePicker.innerHTML = '<option value="" disabled selected>Carregando...</option>';
            const snapshot = await db.collection('agendamentos').where('data', '==', selectedDate).get();
            const agendamentosDoDia = snapshot.docs.map(doc => doc.data());
            const horariosDoDia = getHorariosDoDia(selectedDate);
            timePicker.innerHTML = '';
            if (horariosDoDia) {
                let horarioAtual = new Date(`${selectedDate}T${horariosDoDia.inicio}`);
                const fimExpediente = new Date(`${selectedDate}T${horariosDoDia.fim}`);
                while (horarioAtual < fimExpediente) {
                    const timeStr = horarioAtual.toTimeString().substring(0, 5);
                    if (!agendamentosDoDia.some(app => app.horario === timeStr)) {
                        timePicker.innerHTML += `<option value="${timeStr}">${timeStr}</option>`;
                    }
                    horarioAtual.setMinutes(horarioAtual.getMinutes() + config.intervaloMinutos);
                }
            }
            if (preselectedTime) timePicker.value = preselectedTime;
        };
        if (servicePicker.value) servicePicker.onchange();
        modal.classList.remove('hidden');
        form.onsubmit = async (e) => {
            e.preventDefault();
            const serviceIndex = form['manual-service-picker'].value;
            const service = servicosDoBanco[serviceIndex];
            const docId = `${selectedDate}_${form['manual-time-picker'].value}`;
            const data = {
                nomeCliente: form['manual-client-name'].value,
                telefoneCliente: `55${form['manual-client-phone'].value.replace(/\D/g, '')}`,
                data: selectedDate,
                horario: form['manual-time-picker'].value,
                servicoNome: service.nome,
                servicoPreco: service.preco,
                duracao: service.duracao,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('agendamentos').doc(docId).set(data);
            modal.classList.add('hidden');
            if (onSaveCallback) onSaveCallback();
            loadDashboardData();
        };
        document.getElementById('cancel-modal-btn').onclick = () => modal.classList.add('hidden');
    }

    function initClientProfileModal(db, phone, clientName, isNewClient = false, onSaveCallback) {
        const modal = document.getElementById('client-profile-modal-backdrop');
        const form = document.getElementById('client-profile-form');
        const detailsContainer = document.getElementById('client-profile-details');
        detailsContainer.innerHTML = '<div class="loading-spinner"></div>';
        modal.classList.remove('hidden');
        document.getElementById('delete-client-btn').classList.toggle('hidden', isNewClient);
        const renderForm = (clientData) => {
            clientData.preferenciasCorte = clientData.preferenciasCorte || {};
            detailsContainer.innerHTML = `
                <div class="input-group"><label for="profile-name">Nome</label><input type="text" id="profile-name" class="input-field" value="${clientData.nome || ''}" required></div>
                <div class="input-group"><label for="profile-phone">Telefone</label><input type="tel" id="profile-phone" class="input-field" value="${clientData.telefone ? clientData.telefone.replace(/\D/g, '').substring(2) : ''}" ${!isNewClient ? 'disabled' : ''} required></div>
                <div class="input-group"><label for="profile-maquina">Nº Máquina</label><input type="text" id="profile-maquina" class="input-field" value="${clientData.preferenciasCorte.maquina || ''}"></div>
                <div class="input-group"><label for="profile-obs">Observações</label><textarea id="profile-obs" class="input-field">${clientData.preferenciasCorte.observacoes || ''}</textarea></div>
                <div class="input-group"><label for="profile-assunto">Último Assunto</label><input type="text" id="profile-assunto" class="input-field" value="${clientData.ultimoassunto || ''}"></div>`;
        };
        if (isNewClient) {
            renderForm({});
        } else {
            db.collection('Clientes').doc(phone).get().then(doc => renderForm(doc.exists ? doc.data() : { nome: clientName, telefone: phone }));
        }
        form.onsubmit = async (e) => {
            e.preventDefault();
            const rawPhone = document.getElementById('profile-phone').value.replace(/\D/g, '');
            if (rawPhone.length < 10 || rawPhone.length > 11) { alert("Telefone inválido."); return; }
            const finalPhone = `55${rawPhone}`;
            const dataToSave = {
                nome: document.getElementById('profile-name').value,
                telefone: finalPhone,
                preferenciasCorte: { maquina: document.getElementById('profile-maquina').value, observacoes: document.getElementById('profile-obs').value },
                ultimoassunto: document.getElementById('profile-assunto').value,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('Clientes').doc(finalPhone).set(dataToSave, { merge: true });
            modal.classList.add('hidden');
            if (onSaveCallback) onSaveCallback();
        };
        document.getElementById('delete-client-btn').onclick = async () => {
            if (confirm(`Tem certeza que deseja excluir permanentemente o cliente ${clientName}?`)) {
                await db.collection('Clientes').doc(phone).delete();
                modal.classList.add('hidden');
                if (onSaveCallback) onSaveCallback();
            }
        };
        document.getElementById('close-client-modal-btn').onclick = () => modal.classList.add('hidden');
    }

    function setupServicosSection() {
        const listContainer = document.getElementById('service-manager-list');
        const modal = document.getElementById('service-modal-backdrop');
        const form = document.getElementById('service-form');
        const modalTitle = document.getElementById('service-modal-title');
        const deleteBtn = document.getElementById('delete-service-btn');
        let currentServiceId = null;

        async function loadServices() {
            listContainer.innerHTML = '<div class="loading-spinner"></div>';
            try {
                const snapshot = await db.collection('servicos').orderBy('nome').get();
                listContainer.innerHTML = '';
                if (snapshot.empty) {
                    listContainer.innerHTML = '<p>Nenhum serviço cadastrado. Clique em "Novo Serviço" para começar.</p>';
                    return;
                }
                snapshot.forEach(doc => {
                    const service = doc.data();
                    const item = document.createElement('div');
                    item.className = 'client-list-item';
                    item.innerHTML = `<div><strong>${service.nome}</strong><span>Duração: ${service.duracao || 'N/A'} min | Preço: R$ ${service.preco || '0,00'}</span></div><i class="fas fa-chevron-right"></i>`;
                    item.addEventListener('click', () => openModal(doc.id, service));
                    listContainer.appendChild(item);
                });
            } catch (error) {
                console.error("Erro ao carregar serviços:", error);
                listContainer.innerHTML = '<p>Ocorreu um erro ao carregar os serviços.</p>';
            }
        }

        function openModal(id = null, data = {}) {
            form.reset();
            currentServiceId = id;
            if (id) {
                modalTitle.textContent = 'Editar Serviço';
                document.getElementById('service-name').value = data.nome || '';
                document.getElementById('service-price').value = data.preco || '';
                document.getElementById('service-duration').value = data.duracao || '';
                deleteBtn.classList.remove('hidden');
            } else {
                modalTitle.textContent = 'Novo Serviço';
                deleteBtn.classList.add('hidden');
            }
            modal.classList.remove('hidden');
        }

        function closeModal() { modal.classList.add('hidden'); }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const dataToSave = {
                nome: document.getElementById('service-name').value,
                preco: document.getElementById('service-price').value,
                duracao: parseInt(document.getElementById('service-duration').value, 10)
            };
            try {
                if (currentServiceId) {
                    await db.collection('servicos').doc(currentServiceId).update(dataToSave);
                } else {
                    await db.collection('servicos').add(dataToSave);
                }
                await loadServices();
                closeModal();
            } catch (error) { console.error("Erro ao salvar serviço:", error); }
        });

        deleteBtn.addEventListener('click', async () => {
            if (confirm('Tem certeza que deseja excluir este serviço?')) {
                try {
                    await db.collection('servicos').doc(currentServiceId).delete();
                    await loadServices();
                    closeModal();
                } catch (error) { console.error("Erro ao excluir serviço:", error); }
            }
        });

        document.getElementById('add-new-service-btn').addEventListener('click', () => openModal());
        document.getElementById('cancel-service-modal-btn').addEventListener('click', closeModal);

        const servicosMenuItem = document.querySelector('.menu-item[data-section="servicos-section"]');
        servicosMenuItem.addEventListener('click', () => {
            if (listContainer.children.length <= 1) { loadServices(); }
        });
    }

    function setupRelatoriosSection() {
        const db = firebase.firestore();
        const generateBtn = document.getElementById('generate-report-btn');
        const downloadBtn = document.getElementById('download-csv-btn');
        const resultsContainer = document.getElementById('report-results-container');
        const tableWrapper = document.getElementById('report-table-wrapper');

        let reportData = [];

        generateBtn.addEventListener('click', async () => {
            const startDate = document.getElementById('report-start-date').value;
            const endDate = document.getElementById('report-end-date').value;

            if (!startDate || !endDate) {
                alert('Por favor, selecione as datas de início e fim.');
                return;
            }

            resultsContainer.classList.remove('hidden');
            tableWrapper.innerHTML = '<div class="loading-spinner"></div>';
            downloadBtn.classList.add('hidden');

            try {
                const snapshot = await db.collection('agendamentos')
                    .where('data', '>=', startDate)
                    .where('data', '<=', endDate)
                    .orderBy('data')
                    .orderBy('horario')
                    .get();

                reportData = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (!data.isBlock) {
                        reportData.push({
                            data: new Date(data.data + 'T12:00:00').toLocaleDateString('pt-BR'),
                            horario: data.horario,
                            cliente: data.nomeCliente,
                            telefone: data.telefoneCliente.replace('55', ''),
                            servico: data.servicoNome,
                            preco: data.servicoPreco || '0,00'
                        });
                    }
                });

                renderReportTable(reportData);

            } catch (error) {
                console.error("Erro ao gerar relatório:", error);
                tableWrapper.innerHTML = '<p>Ocorreu um erro ao buscar os dados. Tente novamente.</p>';
            }
        });

        function renderReportTable(data) {
            if (data.length === 0) {
                tableWrapper.innerHTML = '<p>Nenhum agendamento encontrado no período selecionado.</p>';
                downloadBtn.classList.add('hidden');
                return;
            }

            const table = document.createElement('table');
            table.className = 'report-table';
            const thead = table.createTHead();
            const headerRow = thead.insertRow();
            const headers = ['Data', 'Hora', 'Cliente', 'Telefone', 'Serviço', 'Valor (R$)'];
            headers.forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });

            const tbody = table.createTBody();
            data.forEach(item => {
                const row = tbody.insertRow();
                row.insertCell().textContent = item.data;
                row.insertCell().textContent = item.horario;
                row.insertCell().textContent = item.cliente;
                row.insertCell().textContent = item.telefone;
                row.insertCell().textContent = item.servico;
                row.insertCell().textContent = item.preco;
            });

            tableWrapper.innerHTML = '';
            tableWrapper.appendChild(table);
            downloadBtn.classList.remove('hidden');
        }

        downloadBtn.addEventListener('click', () => {
            if (reportData.length === 0) {
                alert('Não há dados para exportar.');
                return;
            }
            exportToCSV(reportData);
        });

        function exportToCSV(data) {
            const headers = ['Data', 'Hora', 'Cliente', 'Telefone', 'Servico', 'Valor_RS'];
            
            const csvRows = [
                headers.join(','),
                ...data.map(row => 
                    [
                        row.data,
                        row.horario,
                        `"${(row.cliente || '').replace(/"/g, '""')}"`,
                        row.telefone,
                        `"${(row.servico || '').replace(/"/g, '""')}"`,
                        (row.preco || '0.00').replace(',', '.')
                    ].join(',')
                )
            ];

            const csvString = csvRows.join('\n');
            const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });

            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            
            const startDate = document.getElementById('report-start-date').value;
            const endDate = document.getElementById('report-end-date').value;
            link.setAttribute('download', `Relatorio_Agendamentos_${startDate}_a_${endDate}.csv`);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

}); // <-- FIM DO CÓDIGO E DO EVENTO DOMContentLoaded

// FIM DA PARTE 3 DE 3
