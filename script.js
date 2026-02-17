class StorageManager {
	static get(key, fallback) {
		const stored = localStorage.getItem(key);
		if (!stored) return fallback;
		try {
			return JSON.parse(stored);
		} catch (error) {
			return fallback;
		}
	}

	static set(key, value) {
		localStorage.setItem(key, JSON.stringify(value));
	}
}

class TaskManager {
	constructor() {
		this.tasks = StorageManager.get("pomodoro.tasks", []);
	}

	addTask(text) {
		const task = {
			id: crypto.randomUUID(),
			text,
			completed: false,
			active: false,
		};
		this.tasks.unshift(task);
		this.save();
		return task;
	}

	toggleTask(id) {
		this.tasks = this.tasks.map((task) =>
			task.id === id ? { ...task, completed: !task.completed } : task
		);
		this.save();
	}

	deleteTask(id) {
		this.tasks = this.tasks.filter((task) => task.id !== id);
		this.save();
	}

	setActive(id) {
		this.tasks = this.tasks.map((task) => ({
			...task,
			active: task.id === id,
		}));
		this.save();
	}

	getCompletedCount() {
		return this.tasks.filter((task) => task.completed).length;
	}

	save() {
		StorageManager.set("pomodoro.tasks", this.tasks);
	}
}

class Timer {
	constructor({ onTick, onComplete }) {
		this.modes = {
			pomodoro: 25 * 60,
			short: 5 * 60,
			long: 15 * 60,
		};
		this.currentMode = "pomodoro";
		this.remaining = this.modes[this.currentMode];
		this.intervalId = null;
		this.isRunning = false;
		this.onTick = onTick;
		this.onComplete = onComplete;
	}

	start() {
		if (this.isRunning) return;
		this.isRunning = true;
		this.intervalId = setInterval(() => this.tick(), 1000);
	}

	pause() {
		this.isRunning = false;
		clearInterval(this.intervalId);
		this.intervalId = null;
	}

	reset() {
		this.pause();
		this.remaining = this.modes[this.currentMode];
		this.onTick(this.remaining, this.modes[this.currentMode]);
	}

	switchMode(mode) {
		this.currentMode = mode;
		this.reset();
	}

	tick() {
		if (this.remaining <= 0) {
			this.pause();
			this.onComplete(this.currentMode);
			return;
		}
		this.remaining -= 1;
		this.onTick(this.remaining, this.modes[this.currentMode]);
	}
}

class UIController {
	constructor() {
		this.timerDisplay = document.getElementById("timerDisplay");
		this.modeButtons = document.querySelectorAll(".mode-button");
		this.startButton = document.getElementById("startButton");
		this.pauseButton = document.getElementById("pauseButton");
		this.resetButton = document.getElementById("resetButton");
		this.sessionCount = document.getElementById("sessionCount");
		this.resetSessions = document.getElementById("resetSessions");
		this.taskForm = document.getElementById("taskForm");
		this.taskInput = document.getElementById("taskInput");
		this.taskList = document.getElementById("taskList");
		this.completedCount = document.getElementById("completedCount");
		this.themeToggle = document.getElementById("themeToggle");
		this.ring = document.querySelector(".ring-progress");

		this.sessionTotal = StorageManager.get("pomodoro.sessions", 0);
		this.taskManager = new TaskManager();

		this.timer = new Timer({
			onTick: (remaining, total) => this.updateTimer(remaining, total),
			onComplete: (mode) => this.handleComplete(mode),
		});

		this.circumference = 2 * Math.PI * 100;
		this.ring.style.strokeDasharray = `${this.circumference}`;
		this.ring.style.strokeDashoffset = "0";

		this.bindEvents();
		this.updateTimer(this.timer.remaining, this.timer.modes[this.timer.currentMode]);
		this.updateSessions();
		this.renderTasks();
	}

	bindEvents() {
		this.modeButtons.forEach((button) =>
			button.addEventListener("click", () => this.handleModeChange(button))
		);
		this.startButton.addEventListener("click", () => this.startTimer());
		this.pauseButton.addEventListener("click", () => this.pauseTimer());
		this.resetButton.addEventListener("click", () => this.resetTimer());
		this.resetSessions.addEventListener("click", () => this.resetSessionCount());
		this.taskForm.addEventListener("submit", (event) => this.handleTaskSubmit(event));
		this.taskList.addEventListener("click", (event) => this.handleTaskAction(event));
		this.themeToggle.addEventListener("click", () => this.toggleTheme());
		document.addEventListener("keydown", (event) => this.handleShortcut(event));
	}

	handleModeChange(button) {
		if (this.timer.isRunning) {
			this.pauseTimer();
		}
		this.modeButtons.forEach((btn) => btn.classList.remove("active"));
		button.classList.add("active");
		this.timer.switchMode(button.dataset.mode);
		this.updateButtons();
	}

	startTimer() {
		this.requestNotification();
		this.timer.start();
		this.updateButtons();
	}

	pauseTimer() {
		this.timer.pause();
		this.updateButtons();
	}

	resetTimer() {
		this.timer.reset();
		this.updateButtons();
	}

	updateTimer(remaining, total) {
		this.timerDisplay.textContent = this.formatTime(remaining);
		const progress = remaining / total;
		const offset = this.circumference * (1 - progress);
		this.ring.style.strokeDashoffset = `${offset}`;
	}

	updateButtons() {
		this.startButton.disabled = this.timer.isRunning;
		this.pauseButton.disabled = !this.timer.isRunning;
	}

	handleComplete(mode) {
		if (mode === "pomodoro") {
			this.sessionTotal += 1;
			StorageManager.set("pomodoro.sessions", this.sessionTotal);
			this.updateSessions();
		}
		this.playSound();
		this.showNotification(mode);
		this.updateButtons();
	}

	updateSessions() {
		this.sessionCount.textContent = this.sessionTotal;
	}

	resetSessionCount() {
		this.sessionTotal = 0;
		StorageManager.set("pomodoro.sessions", 0);
		this.updateSessions();
	}

	handleTaskSubmit(event) {
		event.preventDefault();
		const text = this.taskInput.value.trim();
		if (!text) return;
		this.taskManager.addTask(text);
		this.taskInput.value = "";
		this.renderTasks();
	}

	handleTaskAction(event) {
		const taskItem = event.target.closest(".task-item");
		if (!taskItem) return;
		const taskId = taskItem.dataset.id;
		const action = event.target.dataset.action;

		if (action === "toggle") {
			this.taskManager.toggleTask(taskId);
		} else if (action === "delete") {
			this.taskManager.deleteTask(taskId);
		} else if (action === "active") {
			this.taskManager.setActive(taskId);
		}

		this.renderTasks();
	}

	renderTasks() {
		this.taskList.innerHTML = "";
		this.taskManager.tasks.forEach((task) => {
			const item = document.createElement("li");
			item.className = `task-item${task.completed ? " completed" : ""}${
				task.active ? " active" : ""
			}`;
			item.dataset.id = task.id;
			item.innerHTML = `
				<input type="checkbox" data-action="toggle" ${
					task.completed ? "checked" : ""
				} />
				<div class="task-name" data-action="active">${task.text}</div>
				<div class="task-actions">
					<button class="task-button" data-action="active">Focus</button>
					<button class="task-button delete" data-action="delete">Delete</button>
				</div>
			`;
			this.taskList.appendChild(item);
		});
		this.completedCount.textContent = this.taskManager.getCompletedCount();
	}

	requestNotification() {
		if (!("Notification" in window)) return;
		if (Notification.permission === "default") {
			Notification.requestPermission();
		}
	}

	showNotification(mode) {
		if (!("Notification" in window)) return;
		if (Notification.permission !== "granted") return;
		const modeLabel =
			mode === "pomodoro" ? "Pomodoro" : mode === "short" ? "Short break" : "Long break";
		new Notification("Session complete", {
			body: `${modeLabel} finished. Time to switch!`,
		});
	}

	playSound() {
		const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
		const oscillator = audioCtx.createOscillator();
		const gain = audioCtx.createGain();
		oscillator.type = "sine";
		oscillator.frequency.value = 660;
		gain.gain.value = 0.12;
		oscillator.connect(gain);
		gain.connect(audioCtx.destination);
		oscillator.start();
		oscillator.stop(audioCtx.currentTime + 0.6);
	}

	toggleTheme() {
		const current = document.body.dataset.theme || "light";
		document.body.dataset.theme = current === "light" ? "dark" : "light";
	}

	handleShortcut(event) {
		if (event.code !== "Space") return;
		if (document.activeElement === this.taskInput) return;
		event.preventDefault();
		if (this.timer.isRunning) {
			this.pauseTimer();
		} else {
			this.startTimer();
		}
	}

	formatTime(seconds) {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
	}
}

document.addEventListener("DOMContentLoaded", () => {
	new UIController();
});
