document.getElementById('open-wallet').addEventListener('click', function () {
  chrome.tabs.create({ url: 'https://wallet.spw.network/' });
});
