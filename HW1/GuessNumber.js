/*
Program for generating and guessing number 1-10
by Vojtech Naar
*/
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let secretNumber = Math.floor(Math.random() * 11);
let attempts = 0;

function askGuess() {
  rl.question("Enter your guess (0-10): ", function(guess) {

    guess = Number(guess);
    attempts = attempts + 1;

    if (guess === secretNumber) {
      console.log("Correct! You guessed the number " + secretNumber);
      rl.close();
      return;
    }

    if (attempts === 5) {
      console.log("You lost! The correct number was " + secretNumber);
      rl.close();
      return;
    }

    if (guess > secretNumber) {
      console.log("Your guess is higher than the secret number.");
    } else {
      console.log("Your guess is lower than the secret number.");
    }

    askGuess();
  });
}

askGuess();