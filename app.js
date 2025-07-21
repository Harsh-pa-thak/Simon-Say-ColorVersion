let start = false;
let level = 0;
let gamePattern = [];
let userClickedPattern = [];
const buttons = ["red", "yellow", "blue", "green"];

let h2 = document.querySelector("h2");
let bdy = document.querySelector("body");
let allButtons = document.querySelectorAll(".box");

// High score logic
let highScore = localStorage.getItem("simonHighScore") || 0;
let highScoreDisplay = document.createElement("div");
highScoreDisplay.id = "highScore";
highScoreDisplay.style.marginBottom = "10px";
highScoreDisplay.innerHTML = `🏆 High Score: <b>${highScore}</b>`;
document.body.insertBefore(highScoreDisplay, document.querySelector(".container"));

// Start game on first click
document.addEventListener("click", function () {
    if (!start) {
        start = true;
        levelUp();
        console.log("Game started!");
    }
});

function levelUp() {
    userClickedPattern = [];
    level++;
    h2.innerText = "Level " + level;
    let randomNumber = Math.floor(Math.random() * 4);
    let randomChosenColor = buttons[randomNumber];
    gamePattern.push(randomChosenColor);

    setTimeout(() => {
        computerFlash(document.querySelector("." + randomChosenColor));
    }, 400);
}

// Computer presses (different color)
function computerFlash(btn) {
    btn.classList.add("computerFlash");
    setTimeout(function () {
        btn.classList.remove("computerFlash");
    }, 300);
}

for (let b of allButtons) {
    b.addEventListener("click", clickedButton);
}

function clickedButton() {
    let btn = this;
    userClicked(btn);
}

// User presses (different color)
function userClicked(btn) {
    btn.classList.add("userClicked");
    setTimeout(function () {
        btn.classList.remove("userClicked");
        let userbtn = btn.classList[1];
        userClickedPattern.push(userbtn);
        checkAnswer(userClickedPattern.length - 1);
    }, 200);
}

function checkAnswer(lastIndex) {
    if (userClickedPattern[lastIndex] === gamePattern[lastIndex]) {
        if (userClickedPattern.length === gamePattern.length) {
            setTimeout(levelUp, 700);
        }
    } else {
        if (level > highScore) {
            highScore = level;
            localStorage.setItem("simonHighScore", highScore);
            highScoreDisplay.innerHTML = `🏆 High Score: <b>${highScore}</b>`;
        }
        h2.innerHTML = `❌ <span style="color:#ff2929;">Wrong!</span> Game Over!<br>Score <b>${level}</b><br><span style="font-size:1rem;">Press anywhere to restart.</span>`;
        restart();
    }
}

// Restart animation
function restart() {
    start = false;
    gamePattern = [];
    userClickedPattern = [];
    level = 0;
    bdy.classList.add("userClicked");
    setTimeout(function () {
        bdy.classList.remove("userClicked");
    }, 1000);
    
}