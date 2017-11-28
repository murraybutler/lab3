'use strict';

const Alexa = require('alexa-sdk');

exports.handler = (event, context) => {
  // standard Alexa Skill Kit initialization
  const alexa = Alexa.handler(event, context);
  alexa.appId = '';
  alexa.registerHandlers(main);
  alexa.execute();
};

const main = {
  'LaunchRequest': function() {
    console.log('LaunchRequest');

    /*
      For this skill, on launch we'll immediately setup the
      input handler to listen to all attached buttons for 30
      seconds.
      We'll setup two events that each report when buttons are
      pressed down and when they're released up.
      After 30 seconds, we'll get the timeout event.
    */
    this.response._addDirective({
      "type": "GameEngine.StartInputHandler",
      "timeout": 30000,
      "recognizers": {
        "button_down_recognizer": {
          type: "match",
          fuzzy: false,
          anchor: "end",
          "pattern": [{
            "action": "down"
          }]
        }
      },
      "events": {
        "button_down_event": {
          "meets": ["button_down_recognizer"],
          "reports": "matches",
          "shouldEndInputHandler": false
        },
        "timeout": {
          "meets": ["timed out"],
          "reports": "history",
          "shouldEndInputHandler": true
        }
      }
    });

    /*
      If buttons are awake before we start, we can send
      animations to all of them by targeting the empty array []
    */

    // start keeping track of some state
    this.attributes.buttonCount = 0;

    // build 'idle' breathing animation that will play immediately
    this.response._addDirective(buildButtonIdleAnimationDirective([], breathAnimation));

    // build 'button down' animation for when the button is pressed
    this.response._addDirective(buildButtonDownAnimationDirective([]));

    // we'll say something in the standard way
    this.response.speak("Welcome to Hello Buttons Skill. Tell me your favorite color.").listen("What is your favorite color?");

    // we use the manual mechanism to end the response, because we've modified the response directly
    this.emit(':responseReady');
  },
  'GameEngine.InputHandlerEvent': function() {
    console.log('Received game event', JSON.stringify(this.event, null, 2));

    let gameEngineEvents = this.event.request.events || [];
    for (let i = 0; i < gameEngineEvents.length; i++) {

      let buttonId;

      // in this request type, we'll see one or more incoming events
      // corresponding to the StartInputHandler we sent above
      switch (gameEngineEvents[i].name) {
        case 'button_down_event':

          // id of the button that triggered event
          buttonId = gameEngineEvents[i].inputEvents[0].gadgetId;

          // recognize a new button
          let isNewButton = false;
          if (this.attributes[buttonId + '_initialized'] === undefined) {
            isNewButton = true;
            this.attributes.buttonCount += 1;
            /*
              This is a new button, as in new to our understanding.
              Because this button may have just woken up, it may not
              have received our initial animations during Launch Intent
              we'll resend them here, but instead of the empty array
              broadcast above, here we'll send them ONLY to this buttonId
            */
            this.response._addDirective(buildButtonIdleAnimationDirective([buttonId], breathAnimation));
            this.response._addDirective(buildButtonDownAnimationDirective([buttonId]));

            this.attributes[buttonId + '_initialized'] = true;
          }

          if (isNewButton) {
            // say something when we first encounter a button
            this.response.speak('hello, button ' + this.attributes.buttonCount);

            /*
              Alexa might still be saying something from a previous
              speech response. To get a snappier response here, we can
              ask this response to interrupt the previous one!
            */
            this.handler.response.response.outputSpeech.playBehavior = 'REPLACE_ALL';
          }

          // once more, we finish with this because we've directly manipulated the response
          this.emit(':responseReady');

          break;

        case 'timeout':

          this.response.speak("Thank you for playing!");

          this.response._addDirective(buttonFadeoutAnimationDirective);

          /*
            Now that we're really done, we actually want to end
            the session and clean up.
          */
          this.handler.response.response.shouldEndSession = true;

          this.emit(':responseReady');

          break;
      }
    }
  },
  /*
    Standard skill intent handling
  */
  'FavoriteColorIntent': function() {
    let slotValues = getSlotValues(this.event.request.intent.slots);
    let favoriteColor = slotValues.color.resolved;
    let favoriteColorHex = colorNameToHex(favoriteColor);
    breathAnimation = buildBreathAnimation('000000', favoriteColorHex, 30, 1200);

    console.log('FavoriteColor: ' + favoriteColor);
    this.response.speak("Click on the button you wish to change to " + favoriteColor);
    this.emit(':responseReady');
  },
  'AMAZON.HelpIntent': function() {
    console.log('HelpIntent');
    const msg = 'Welcome to Hello Buttons skill. Press your buttons.';
    this.emit(':tell', msg, msg);
  },
  'AMAZON.StopIntent': function() {
    console.log('StopIntent');
    this.response.speak('Good Bye!');

    this.response._addDirective(buttonFadeoutAnimationDirective);

    this.emit(':responseReady');
  },
  'AMAZON.CancelIntent': function() {
    console.log('CancelIntent');
    this.response.speak('Alright, canceling');

    this.response._addDirective(buttonFadeoutAnimationDirective);

    this.emit(':responseReady');
  },
  'SessionEndedRequest': function() {
    console.log('SessionEndedRequest');
  },
  'System.ExceptionEncountered': function() {
    console.log('ExceptionEncountered');
    console.log(this.event.request.error);
    console.log(this.event.request.cause);
  },
  'Unhandled': function() {
    console.log('Unhandled');
    const msg = "Sorry, I didn't get that.";
    this.emit(':ask', msg, msg);
  }
};

/*
  Here we'll write ourselves a few animation generation function
  that work with the hexadecimal format SetLight expects
*/

const buildBreathAnimation = function(fromRgbHex, toRgbHex, steps, totalDuration) {
  const halfSteps = steps / 2;
  const halfTotalDuration = totalDuration / 2;
  return buildSeqentialAnimation(fromRgbHex, toRgbHex, halfSteps, halfTotalDuration)
    .concat(buildSeqentialAnimation(toRgbHex, fromRgbHex, halfSteps, halfTotalDuration));
}

const buildSeqentialAnimation = function(fromRgbHex, toRgbHex, steps, totalDuration) {
  const fromRgb = parseInt(fromRgbHex, 16);
  let fromRed = fromRgb >> 16;
  let fromGreen = (fromRgb & 0xff00) >> 8;
  let fromBlue = fromRgb & 0xff;

  const toRgb = parseInt(toRgbHex, 16);
  const toRed = toRgb >> 16;
  const toGreen = (toRgb & 0xff00) >> 8;
  const toBlue = toRgb & 0xff;

  const deltaRed = (toRed - fromRed) / steps;
  const deltaGreen = (toGreen - fromGreen) / steps;
  const deltaBlue = (toBlue - fromBlue) / steps;

  const oneStepDuration = Math.floor(totalDuration / steps);

  const result = [];

  for (let i = 0; i < steps; i++) {
    result.push({
      "durationMs": oneStepDuration,
      "color": rgb2h(fromRed, fromGreen, fromBlue),
      "intensity": 255,
      "blend": true
    });
    fromRed += deltaRed;
    fromGreen += deltaGreen;
    fromBlue += deltaBlue;
  }

  return result;
}

const rgb2h = function(r, g, b) {
  return '' + n2h(r) + n2h(g) + n2h(b);
}
// number to hex with leading zeroes
const n2h = function(n) {
  return ('00' + (Math.floor(n)).toString(16)).substr(-2);
}

let breathAnimation = buildBreathAnimation('000000', 'ffffff', 30, 1200);

// build 'button down' animation directive
// animation will overwrite default 'button down' animation
const buildButtonDownAnimationDirective = function(targetGadgets) {
  return {
    "type": "GadgetController.SetLight",
    "version": 1,
    "targetGadgets": targetGadgets,
    "parameters": {
      "animations": [{
        "repeat": 1,
        "targetLights": ["1"],
        "sequence": [{
          "durationMs": 300,
          "color": "FFFF00",
          "intensity": 255,
          "blend": false
        }]
      }],
      "triggerEvent": "buttonDown",
      "triggerEventTimeMs": 0
    }
  }
};

// build idle animation directive
const buildButtonIdleAnimationDirective = function(targetGadgets, animation) {
  return {
    "type": "GadgetController.SetLight",
    "version": 1,
    "targetGadgets": targetGadgets,
    "parameters": {
      "animations": [{
        "repeat": 100,
        "targetLights": ["1"],
        "sequence": animation
      }],
      "triggerEvent": "none",
      "triggerEventTimeMs": 0
    }
  }
};

// fadeout animation directive
const buttonFadeoutAnimationDirective = {
  "type": "GadgetController.SetLight",
  "version": 1,
  "targetGadgets": [],
  "parameters": {
    "animations": [{
      "repeat": 1,
      "targetLights": ["1"],
      "sequence": [{
        "durationMs": 1,
        "color": "FFFFFF",
        "intensity": 255,
        "blend": true
      }, {
        "durationMs": 1000,
        "color": "000000",
        "intensity": 255,
        "blend": true
      }]
    }],
    "triggerEvent": "none",
    "triggerEventTimeMs": 0
  }
};

function colorNameToHex(color) {
    var colors = {"aliceblue":"f0f8ff","antiquewhite":"faebd7","aqua":"00ffff","aquamarine":"7fffd4","azure":"f0ffff",
    "beige":"f5f5dc","bisque":"ffe4c4","black":"000000","blanchedalmond":"ffebcd","blue":"0000ff","blueviolet":"8a2be2",
    "brown":"a52a2a","burlywood":"deb887","cadetblue":"5f9ea0","chartreuse":"7fff00","chocolate":"d2691e","coral":"ff7f50",
    "cornflowerblue":"6495ed","cornsilk":"fff8dc","crimson":"dc143c","cyan":"00ffff","darkblue":"00008b","darkcyan":"008b8b",
    "darkgoldenrod":"b8860b","darkgray":"a9a9a9","darkgreen":"006400","darkkhaki":"bdb76b","darkmagenta":"8b008b",
    "darkolivegreen":"556b2f","darkorange":"ff8c00","darkorchid":"9932cc","darkred":"8b0000","darksalmon":"e9967a",
    "darkseagreen":"8fbc8f","darkslateblue":"483d8b","darkslategray":"2f4f4f","darkturquoise":"00ced1","darkviolet":"9400d3",
    "deeppink":"ff1493","deepskyblue":"00bfff","dimgray":"696969","dodgerblue":"1e90ff","firebrick":"b22222","floralwhite":"fffaf0",
    "forestgreen":"228b22","fuchsia":"ff00ff","gainsboro":"dcdcdc","ghostwhite":"f8f8ff","gold":"ffd700","goldenrod":"daa520",
    "gray":"808080","green":"008000","greenyellow":"adff2f","honeydew":"f0fff0","hotpink":"ff69b4","indianred ":"cd5c5c",
    "indigo":"4b0082","ivory":"fffff0","khaki":"f0e68c","lavender":"e6e6fa","lavenderblush":"fff0f5","lawngreen":"7cfc00",
    "lemonchiffon":"fffacd","lightblue":"add8e6","lightcoral":"f08080","lightcyan":"e0ffff","lightgoldenrodyellow":"fafad2",
    "lightgrey":"d3d3d3","lightgreen":"90ee90","lightpink":"ffb6c1","lightsalmon":"ffa07a","lightseagreen":"20b2aa",
    "lightskyblue":"87cefa","lightslategray":"778899","lightsteelblue":"b0c4de","lightyellow":"ffffe0","lime":"00ff00",
    "limegreen":"32cd32","linen":"faf0e6","magenta":"ff00ff","maroon":"800000","mediumaquamarine":"66cdaa","mediumblue":"0000cd",
    "mediumorchid":"ba55d3","mediumpurple":"9370d8","mediumseagreen":"3cb371","mediumslateblue":"7b68ee","mediumspringgreen":"00fa9a",
    "mediumturquoise":"48d1cc","mediumvioletred":"c71585","midnightblue":"191970","mintcream":"f5fffa","mistyrose":"ffe4e1",
    "moccasin":"ffe4b5","navajowhite":"ffdead","navy":"000080","oldlace":"fdf5e6","olive":"808000","olivedrab":"6b8e23",
    "orange":"ffa500","orangered":"ff4500","orchid":"da70d6","palegoldenrod":"eee8aa","palegreen":"98fb98","paleturquoise":"afeeee",
    "palevioletred":"d87093","papayawhip":"ffefd5","peachpuff":"ffdab9","peru":"cd853f","pink":"ffc0cb","plum":"dda0dd",
    "powderblue":"b0e0e6","purple":"800080","rebeccapurple":"663399","red":"ff0000","rosybrown":"bc8f8f","royalblue":"4169e1",
    "saddlebrown":"8b4513","salmon":"fa8072","sandybrown":"f4a460","seagreen":"2e8b57","seashell":"fff5ee","sienna":"a0522d",
    "silver":"c0c0c0","skyblue":"87ceeb","slateblue":"6a5acd","slategray":"708090","snow":"fffafa","springgreen":"00ff7f",
    "steelblue":"4682b4","tan":"d2b48c","teal":"008080","thistle":"d8bfd8","tomato":"ff6347","turquoise":"40e0d0",
    "violet":"ee82ee","wheat":"f5deb3","white":"ffffff","whitesmoke":"f5f5f5","yellow":"ffff00","yellowgreen":"9acd32"};

    if (typeof colors[color.toLowerCase()] != 'undefined')
        return colors[color.toLowerCase()];

    return "ffffff";
}

function getSlotValues (filledSlots) {
    //given event.request.intent.slots, a slots values object so you have
    //what synonym the person said - .synonym
    //what that resolved to - .resolved
    //and if it's a word that is in your slot values - .isValidated
    let slotValues = {};

    console.log(JSON.stringify(filledSlots));

    Object.keys(filledSlots).forEach(function(item) {
        //console.log("item in filledSlots: "+JSON.stringify(filledSlots[item]));
        var name=filledSlots[item].name;
        //console.log("name: "+name);
        if(filledSlots[item]&&
           filledSlots[item].resolutions &&
           filledSlots[item].resolutions.resolutionsPerAuthority[0] &&
           filledSlots[item].resolutions.resolutionsPerAuthority[0].status &&
           filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code ) {

            switch (filledSlots[item].resolutions.resolutionsPerAuthority[0].status.code) {
                case "ER_SUCCESS_MATCH":
                    slotValues[name] = {
                        "synonym": filledSlots[item].value,
                        "resolved": filledSlots[item].resolutions.resolutionsPerAuthority[0].values[0].value.name,
                        "isValidated": filledSlots[item].value == filledSlots[item].resolutions.resolutionsPerAuthority[0].values[0].value.name
                    };
                    break;
                case "ER_SUCCESS_NO_MATCH":
                    slotValues[name] = {
                        "synonym":filledSlots[item].value,
                        "resolved":filledSlots[item].value,
                        "isValidated":false
                    };
                    break;
                }
            } else {
                slotValues[name] = {
                    "synonym": filledSlots[item].value,
                    "resolved":filledSlots[item].value,
                    "isValidated": false
                };
            }
        },this);
        //console.log("slot values: "+JSON.stringify(slotValues));
        return slotValues;
}

