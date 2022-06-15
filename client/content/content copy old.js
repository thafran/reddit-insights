console.log('content.js');

const USER_PATH_PATTERN = '/user/'

// // TODO: Check if scrolling also works
// function getUserNameElements() {
//   const anchorTags = document.getElementsByTagName("a");
//   const filteredAnchorTags = Array.from(anchorTags).filter(anchor => anchor.href.includes(USER_PATH_PATTERN));
//   return filteredAnchorTags;
// }

// const userNameElements = getUserNameElements();
// console.log(userNameElements);


// function enrichUserNameElement(userNameElement) {
//   const text = document.createElement("p")
//   text.setAttribute("color", "red")
//   text.textContent = "Dysis"
//   console.log(userNameElement.parent);
//   userNameElement.insertAdjacentElement('beforeend', text);
  
//   console.log('Inserted element ' + userNameElement);
  
// }

// function enrichUserNameElements() {
//   for (const userNameElement of userNameElements) {
//     enrichUserNameElement(userNameElement)
//   }
// }

// enrichUserNameElements()

const anchorTags = document.getElementsByTagName("a");

const filteredAnchorTags = Array.from(anchorTags).filter(a => a.href.includes(USER_PATH_PATTERN));
 
for (const anchorTag of filteredAnchorTags) {
  console.log('Inside for loop');
  
  console.log(anchorTag);
  console.log(anchorTag.parentElement)
  anchorTag.setAttribute("color", "red !important");
  const divBox = document.createElement("span")
  const text = document.createElement("span")
  text.setAttribute("color", "red !important")
  text.textContent = "Dysis"

  divBox.appendChild(text)
  // anchorTag.parentNode.appendChild(text)
  anchorTag.parentNode.insertAdjacentElement("beforeend", text)
}
