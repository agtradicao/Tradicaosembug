// ===================================================================
// ARQUIVO: app.js (VERSÃO 6.1 - CORRIGIDO PARA SAFARI)
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. INICIALIZAÇÃO ---
    if (!firebase.apps.length) {
        try {
            firebase.initializeApp(config.firebaseConfig);
        } catch (e) {
            console.error("Erro ao inicializar o Firebase.", e);
            alert("Erro de configuração. Não foi possível conectar ao sistema de agendamento.");
            return;
        }
    }
    const db = firebase.firestore();
    const auth = firebase.auth();

    let dynamicConfig = {};
    let servicosDisponiveis = [];

    async function main() {
        await auth.signInAnonymously().catch(error => console.error("Erro no login anônimo:", error));
        await loadDynamicConfig(); 
        await carregarServicos();
        carregarInfoBarbearia();
        configurarDatePicker();
        setupEventListeners();
    }

    async function loadDynamicConfig() {
        try {
            const doc = await db.collection('configuracoes').doc('geral').get();
            if (doc.exists) {
                dynamicConfig = doc.data();
            } else {
                console.warn("Documento de configurações não encontrado.");
                dynamicConfig = { diasBloqueados: [], horarios: {} };
            }
        } catch (error) {
            console.error("Erro fatal ao carregar configurações dinâmicas:", error);
            dynamicConfig = { diasBloqueados: [], horarios: {} };
            alert("Não foi possível carregar as configurações do sistema.");
        }
    }

    const logo = document.getElementById('logo-barbearia');
    const nomeBarbearia = document.getElementById('nome-barbearia');
    const footerName = document.getElementById('footer-barber-name');
    const servicePicker = document.getElementById('service-picker');
    const datePicker = document.getElementById('date-picker');
    const timesContainer = document.getElementById('times-container');
    const timeSlotsSection = document.getElementById('time-slots');
    const bookingFormSection = document.getElementById('booking-form');
    const form = document.getElementById('form');
    const clientPhoneInput = document.getElementById('client-phone');
    const loadingSpinner = document.getElementById('loading-spinner');
    const submitButton = form.querySelector('button');

    let agendamentosDoDia = [];

    // ✅✅✅ FUNÇÃO CORRIGIDA PARA SAFARI E OUTROS NAVEGADORES ✅✅✅
    function getHorariosDoDia(dataSelecionada) {
        // Separa a data 'YYYY-MM-DD' em partes numéricas
        const [ano, mes, dia] = dataSelecionada.split('-').map(Number);
        
        // Cria a data usando UTC para evitar problemas com fuso horário
        const dataObj = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
    
        // Obtém o dia da semana em português e normaliza (ex: "terça-feira" vira "terca")
        let diaSemana = dataObj.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
        diaSemana = diaSemana.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace('-feira', '');
    
        // O resto da lógica continua igual
        if (dynamicConfig.horarios && dynamicConfig.horarios[diaSemana]) {
            const horarioDia = dynamicConfig.horarios[diaSemana];
            if (horarioDia.aberto) {
                return { inicio: horarioDia.inicio, fim: horarioDia.fim };
            }
        }
        return null;
    }

    function isHorarioDisponivel(horarioInicio, duracaoServico, selectedDate) {
        const horarioFimServico = new Date(horarioInicio.getTime() + duracaoServico * 60000);
        const horariosDoDia = getHorariosDoDia(selectedDate);
        if (!horariosDoDia) return false;
        const fimExpediente = new Date(`${selectedDate}T${horariosDoDia.fim}`);
        if (horarioFimServico > fimExpediente) return false;
        for (const agendamento of agendamentosDoDia) {
            const agendamentoInicio = new Date(`${selectedDate}T${agendamento.horario}`);
            const agendamentoFim = new Date(agendamentoInicio.getTime() + (agendamento.duracao || config.intervaloMinutos) * 60000);
            if (horarioInicio < agendamentoFim && horarioFimServico > agendamentoInicio) return false;
        }
        return true;
    }

    function carregarInfoBarbearia() {
        document.title = `${config.nomeBarbearia} - Agendamento`;
        logo.src = config.logoUrl;
        logo.alt = `Logo da ${config.nomeBarbearia}`;
        nomeBarbearia.textContent = config.nomeBarbearia;
        footerName.textContent = config.nomeBarbearia;
    }

    async function carregarServicos() {
        try {
            const snapshot = await db.collection('servicos').orderBy('nome').get();
            servicosDisponiveis = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.ativo !== false) {
                    servicosDisponiveis.push({ id: doc.id, ...data });
                }
            });

            servicePicker.innerHTML = '<option value="" disabled selected>Selecione um serviço</option>';
            servicosDisponiveis.forEach((service, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = `${service.nome} (R$ ${service.preco})`;
                servicePicker.appendChild(option);
            });

        } catch (error) {
            console.error("Erro ao carregar serviços:", error);
            servicePicker.innerHTML = '<option value="">Erro ao carregar serviços</option>';
        }
    }

    function configurarDatePicker() {
        const today = new Date();
        const maxDate = new Date();
        maxDate.setDate(today.getDate() + 30);
        datePicker.setAttribute('min', today.toISOString().split('T')[0]);
        datePicker.setAttribute('max', maxDate.toISOString().split('T')[0]);
    }

    function verificarParaMostrarHorarios() {
        if (servicePicker.value && datePicker.value) {
            mostrarHorariosDisponiveis(datePicker.value);
        } else {
            timeSlotsSection.classList.add('hidden');
            bookingFormSection.classList.add('hidden');
        }
    }

    async function mostrarHorariosDisponiveis(selectedDate) {
        timeSlotsSection.classList.remove('hidden');
        bookingFormSection.classList.add('hidden');
        timesContainer.innerHTML = '<div class="loading-spinner"></div>';
        const isDataBloqueada = dynamicConfig.diasBloqueados && dynamicConfig.diasBloqueados.includes(selectedDate);
        if (isDataBloqueada) {
            timesContainer.innerHTML = '<p>A barbearia está fechada neste dia (feriado/folga).</p>';
            return;
        }
        const horariosDoDia = getHorariosDoDia(selectedDate);
        if (!horariosDoDia) {
            timesContainer.innerHTML = '<p>A barbearia está fechada neste dia da semana.</p>';
            return;
        }
        try {
            const snapshot = await db.collection('agendamentos').where('data', '==', selectedDate).get();
            agendamentosDoDia = snapshot.docs.map(doc => ({ horario: doc.data().horario, duracao: doc.data().duracao || config.intervaloMinutos }));
            gerarSlotsDeHorario(selectedDate);
        } catch (error) {
            console.error("Erro ao carregar horários:", error);
            timesContainer.innerHTML = '<p>Não foi possível carregar os horários. Tente novamente.</p>';
        }
    }
    
    function gerarSlotsDeHorario(selectedDate) {
        timesContainer.innerHTML = '';
        const servicoSelecionado = servicosDisponiveis[servicePicker.value];
        if (!servicoSelecionado) return;

        const horariosDoDia = getHorariosDoDia(selectedDate);
        if (!horariosDoDia) return;

        const hojeString = new Date().toISOString().split('T')[0];
        const agora = new Date();

        const antecedencia = dynamicConfig.antecedenciaMinutos || 60;
        const horarioMinimo = new Date(agora.getTime() + antecedencia * 60000);

        const inicioExpediente = new Date(`${selectedDate}T${horariosDoDia.inicio}`);
        const fimExpediente = new Date(`${selectedDate}T${horariosDoDia.fim}`);
        let horarioAtual = inicioExpediente;
        let algumHorarioDisponivel = false;

        while (horarioAtual < fimExpediente) {
            const horarioString = horarioAtual.toTimeString().substring(0, 5);
            const timeButton = document.createElement('button');
            timeButton.className = 'time-btn';
            timeButton.textContent = horarioString;
            timeButton.dataset.time = horarioString;

            const horarioBloqueadoAntecedencia = selectedDate === hojeString && horarioAtual < horarioMinimo;
            const disponivel = isHorarioDisponivel(horarioAtual, servicoSelecionado.duracao, selectedDate);

            if (disponivel && !horarioBloqueadoAntecedencia) {
                algumHorarioDisponivel = true;
            } else {
                timeButton.disabled = true;
            }
            timesContainer.appendChild(timeButton);
            horarioAtual.setMinutes(horarioAtual.getMinutes() + config.intervaloMinutos);
        }

        if (!algumHorarioDisponivel) {
            timesContainer.innerHTML = '<p>Não há horários disponíveis para este dia com o serviço selecionado.</p>';
        }
    }

    function setupEventListeners() {
        servicePicker.addEventListener('change', verificarParaMostrarHorarios);
        datePicker.addEventListener('change', () => {
            datePicker.classList.toggle('has-value', !!datePicker.value);
            verificarParaMostrarHorarios();
        });

        clientPhoneInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            value = value.substring(0, 11);
            if (value.length > 10) {
                e.target.value = value.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
            } else {
                e.target.value = value.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
            }
        });

        timesContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('time-btn') && !event.target.disabled) {
                document.querySelectorAll('.time-btn').forEach(btn => btn.classList.remove('selected'));
                event.target.classList.add('selected');
                bookingFormSection.classList.remove('hidden');
                bookingFormSection.scrollIntoView({ behavior: 'smooth' });
            }
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            loadingSpinner.classList.remove('hidden');
            submitButton.disabled = true;

            const clientName = document.getElementById('client-name').value;
            const rawPhone = clientPhoneInput.value.replace(/\D/g, '');
            const selectedDate = datePicker.value;
            const selectedTimeBtn = document.querySelector('.time-btn.selected');
            const selectedServiceIndex = servicePicker.value;
            
            const service = servicosDisponiveis[selectedServiceIndex];

            if (!selectedTimeBtn || !service) {
                alert('Por favor, selecione todos os campos.');
                loadingSpinner.classList.add('hidden');
                submitButton.disabled = false;
                return;
            }
            if (rawPhone.length < 10 || rawPhone.length > 11) {
                alert('Por favor, digite um telefone válido com DDD (10 ou 11 dígitos).');
                loadingSpinner.classList.add('hidden');
                submitButton.disabled = false;
                return;
            }
            const finalPhone = `55${rawPhone}`;
            const selectedTime = selectedTimeBtn.dataset.time;
            const docId = `${selectedDate}_${selectedTime}`;
            const appointmentRef = db.collection('agendamentos').doc(docId);

            try {
                await db.runTransaction(async (transaction) => {
                    const doc = await transaction.get(appointmentRef);
                    if (doc.exists) {
                        throw new Error("Que pena! Alguém acabou de agendar neste horário. Por favor, escolha outro.");
                    }
                    transaction.set(appointmentRef, {
                        nomeCliente: clientName,
                        telefoneCliente: finalPhone,
                        data: selectedDate,
                        horario: selectedTime,
                        servicoNome: service.nome,
                        servicoPreco: service.preco,
                        duracao: service.duracao,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                const formattedDate = new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR');
                const message = `Novo Agendamento!\n\n*Cliente:* ${clientName}\n*Data:* ${formattedDate}\n*Horário:* ${selectedTime}\n*Serviço:* ${service.nome}`;
                const whatsappUrl = `https://api.whatsapp.com/send?phone=${dynamicConfig.telefoneWhatsapp}&text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');

                alert('Agendamento realizado com sucesso!');
                location.reload();

            } catch (error) {
                console.error("Erro na transação de agendamento:", error);
                alert(error.message || 'Ocorreu um erro ao tentar agendar. Por favor, tente novamente.');
                verificarParaMostrarHorarios();
            } finally {
                loadingSpinner.classList.add('hidden');
                submitButton.disabled = false;
            }
        });
    }
    
    main();
});

// FIM DO ARQUIVO app.js
