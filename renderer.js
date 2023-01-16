// Constsats to setup %appdata% location to get the latest.log file
const remote = require('electron').remote;
const fs = require("fs");
const app = remote.app;

// Shell to open up links
const {
  shell
} = require('electron');

// The Final path for %appdat%.minecraft logs location
const path = app.getPath('userData').replace('chatmc', '.minecraft') + "\\logs\\";

// Gets the Chatbox Location
const chatBox = document.getElementById('chatbox');

// Sets up last message variable
let lastMessage;

// Gets all Controllers
let controllers = document.querySelectorAll('a[data-controller]');

// Upon chat loading Gets older minecraft chat
getChat(true);

// Runs loop of getting latest message every .5 seconds
setInterval(getChat, 500);

/*
 *
 *      _____ ____ __________  ____________________.___________    _______    _________
 *    _/ ____\    |   \      \ \_   ___ \__    ___/|   \_____  \   \      \  /   _____/
 *    \   __\|    |   /   |   \/    \  \/ |    |   |   |/   |   \  /   |   \ \_____  \
 *     |  |  |    |  /    |    \     \____|    |   |   /    |    \/    |    \/        \
 *     |__|  |______/\____|__  /\______  /|____|   |___\_______  /\____|__  /_______  /
 *                           \/        \/                      \/         \/        \/
 *
 */

// Gets the Latest Chats messages from the Log File
function getChat(flush = false) {
  // Asynchronous reads .minecraft/logs/latest.log
  fs.readFile(path + 'latest.log', function (err, data) {

    // Checks if Error exits and logs the error
    if (err) {
      return console.error(err);
    }

    // Sets Log data to data type String
    let log = data.toString();
    // Checks if Log file is empty
    if (log === "") {
      // Log file is empty upon minecraft booting up
      addMessage("No Chat has been found... Minecraft must be starting up...");
      lastMessage = "No Chat has been found... Minecraft must be starting up...";
      return;
    }

    // Translates Log file into array
    log = log.split("\n");

    // Sets a array to store Chats
    let chats = [];
    // Runs through every message to filter and remove errors and other type logs
    log.forEach((chat) => {

      // Checks if it is true chat message
      if (chat.toLowerCase().includes('[chat]') == true) {

        // Removes Log format prefix (Minecraft 1.14+)
        chat = chat.replace(/ \[(.*)\/(.*)\]:(.*)\[CHAT\] /, ' ');

        // Replaces color character with legable charactor for javascript
        chat = chat.replace(/�/g, '§');

        // Removes all Minecraft Color codes
        chat = chat.replace(/§r/g, '');


        chat = chat.split('§');
        for(let i = 0; i < chat.length; i++) {
               switch (chat[i][0]) {
                  case "0":
                  case "1":
                  case "2":
                  case "3":
                  case "4":
                  case "5":
                  case "6":
                  case "7":
                  case "8":
                  case "9":
                  case "a":
                  case "b":
                  case "c":
                  case "d":
                  case "e":
                  case "f":

                  chat[i] = changeColor(chat[i][0], chat[i].substring(1));

                break;
          }
        }

        chat = chat.join('');

        // Replaces all break lines in messages with HTML Break lines
        chat = chat.replace(/\\n/g, "<br>");

        // Replaces the timestamp prefix with a custom no [] prefix
        chat = chat.replace(/\[[0-9]+:[0-9]+:[0-9]+\]/, chat.match(/[0-9]+:[0-9]+:[0-9]+/) + " >>| ");

        // Adds message to Chats array
        chats.push(chat);
      }
    })

    // Runs when chat is first loaded
    if (flush) {

      // Loops through all filtered Chat messages and adds to display
      chats.forEach((chat) => {
        // Updates lastMessage to prevent duplication
        lastMessage = chat;
        // Sends to front end
        addMessage(chat);
      });

    } else { // Runs when updating Messages
      let bundle = [];
      // Reverses Array to load latest message first
      chats.reverse();
      for (i = 0; i < chats.length; i++) {
        if (chats[i] !== lastMessage) {
          bundle.push(chats[i]);
        } else {
          break;
        }
      }
      bundle.reverse();
      bundle.forEach((chat) => {
        lastMessage = chat;
        addMessage(chat);
      });
    }

  });
}

// Adds messages to the Chatbox
function addMessage(msg) {

  // A regular Expression to find links in the chat
  let regex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,4}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g;

  // Creates Li Element for display
  var e = document.createElement('li');

  // Creates a match for Href Links
  let matches = msg.match(regex);

  // Checks if matches exist to create Hyperlink
  if (matches !== null) {

    // Runs through a loop to link all Hrefs to correct positions
    for (i = 0; i < matches.length; i++) {

      // Sets up the Hyperlink to be clicable
      msg = msg.replace(matches[i], `<a href="#" onclick="openLink(event,'${matches[i]}')" class="yellow-text text-darken-1" style="text-decoration: underline;">${matches[i]}</a>`);

    }

  }

  // Filters out Java Errors
  msg = msg.replace(/java.lang.IllegalArgumentException:(.*)\[(.*)\]/, '');
  msg = msg.replace(/java.lang.IllegalStateException:(.*)\[(.*)\]/, '');

  // Inserts Chat message into the element
  e.innerHTML = msg;

  // Sets the Classes of the message to be displayed
  e.classList = "yellow-text text-darken-1";

  // visualy appends the new element to the display
  chatBox.append(e);

  // Scrolls the the bottom of the site on new message
  window.scrollTo(0, document.body.scrollHeight);
}

// To Open up links in default browsers
function openLink(e, link) {
  e.preventDefault();
  shell.openExternal(link);
}

// To fix Materialize Hover tooltips from static postion making the page scroll Unessesarily
function materialFix() {

  // Gets all the Material Tooltips
  let mT = document.querySelectorAll('.material-tooltip');

  // loops through each tool tip
  mT.forEach((tool) => {

    // Checks if tooltip exits outside of viewport
    if (!isInViewport(tool)) {
      // Sets Tool tip postion and status to null
      tool.style = "";
    }
  });


}

// Gets Viewport Area to Check if Element exists inside of it
var isInViewport = function (elem) {
  // Gets elements bounding area
  var bounding = elem.getBoundingClientRect();
  return (
    bounding.top >= 0 &&
    bounding.left >= 0 &&
    bounding.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    bounding.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
};

function changeColor(key,message) {
  items = {
    "0": 'color: #000000',
    "1": 'color: #0000AA',
    "2": 'color: #00AA00',
    "3": 'color: #00AAAA',
    "4": 'color: #AA0000',
    "5": 'color: #AA00AA',
    "6": 'color: #FFAA00',
    "7": 'color: #AAAAAA',
    "8": 'color: #555555',
    "9": 'color: #5555FF',
    "a": 'color: #55FF55',
    "b": 'color: #55FFFF',
    "c": 'color: #FF5555',
    "d": 'color: #FF55FF',
    "e": 'color: #FFFF55',
    "f": 'color: #FFFFFF',
  };

  message = `<span style="${items[key]}">${message}</span>`;

  return message;
}

/*
 *
 *  _______________   _______________ ___________________________
 *  \_   _____/\   \ /   /\_   _____/ \      \__    ___/   _____/
 *   |    __)_  \   Y   /  |    __)_  /   |   \|    |  \_____  \
 *   |        \  \     /   |        \/    |    \    |  /        \
 *  /_______  /   \___/   /_______  /\____|__  /____| /_______  /
 *          \/                    \/         \/               \/
 *
 */

// Fix the Fixed postion of the Materialized hover Events
window.addEventListener('resize', materialFix);

// Setup the Controllers for the User Interface
controllers.forEach((controller) => {

  // Ads Functionality Click Event to run the Controller Functionality
  controller.addEventListener('click', (e) => {

    // Prevents Default Use
    e.preventDefault();

    //Sets up a switch to Control outputs of Controller
    switch (controller.dataset.controller) {

      // Clears the ChatBox
      case "clear":

        // Checks if item exits in Chatbox and removes it
        while (chatBox.firstChild) {
          // Removes the item in the Chatbox
          chatBox.removeChild(chatBox.firstChild);
        }

        // Scrolls to the top of the page
        document.body.scrollTop = 0; // For Safari
        document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera

        // Runs Materialized Fix to fix scroll over area
        materialFix();

        break; // End of Controller Clear

        // Reloads chat if any information is missing
      case "reload":


        // Checks if item exits in Chatbox and removes it
        while (chatBox.firstChild) {
          // Removes the item in the Chatbox
          chatBox.removeChild(chatBox.firstChild);
        }
        // Gets Every Message from the Minecraft latest.log file
        getChat(true);

        break;
      default:
        // Does Nothing when Controller doesnt exist
        break;
    }
  });

});