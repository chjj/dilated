// generate mock data

var ipsum = function(num) {
  var lorem = _lorem.sort(function() { return Math.random() > .5 ? -1 : 1; });
  var words = [], i = lorem.length;
  if (num) {
    while (i-- && words.length < num) {
      if (Math.random() > .5) words.push(lorem[i]);
    }
  } else {
    while (i--) {
      if (Math.random() > .5) words.push(lorem[i]);
      if (Math.random() > .99) words.push('\n\n');
    }
  }
  return words.sort(function() {
    return Math.random() > .5 ? -1 : 1;
  }).join(' ')
    //.replace(/\s+\./g, '.')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\x20|\x20\n/g, '\n')
    .replace(/(\w)(?=\n|$)/g, '$1.')
    .replace(/(^|\n)\w/g, function(s) { 
      return s.toUpperCase(); 
    });
};

var rand = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min; 
};

var tag = function() {
  var out = [], 
      i = _tags.length, 
      num = rand(1, 5),
      tags = _tags.sort(function() { 
        return Math.random() > .5 ? -1 : 1; 
      });
  while (out.length < num) {
    out.push(tags[--i]);
  }
  return out;
};

module.exports = function(fs, dir, ext) {
  for (var i = 10, id, title, date; i--;) {
    title = ipsum(3).replace('.', '')
      .replace(/(^|\s)\w/g, function(s) { 
        return s.toUpperCase(); 
      });
    id = title.toLowerCase().replace(/\s+/g, '_');
    date = (new Date(Date.now() - (Math.random() * (1000 * 60 * 60 * 24 * 7 * 10))));
    fs.writeFileSync(
      dir + '/' + id + ext,
      JSON.stringify({ 
        title: title, 
        timestamp: date.toISOString(),
        tags: tag(), 
      }, null, 2) + '\n\n'
      + ipsum()
    );
  }
};

var _tags = 'dev misc etc hello world thoughts'.split(' ');
var _lorem = 'Non eram nescius Brute cum quae summis ingeniis exquisitaque doctrina philosophi Graeco sermone tractavissent ea Latinis litteris mandaremus fore ut hic noster labor in varias reprehensiones incurreret nam quibusdam et iis quidem non admodum indoctis totum hoc displicet philosophari quidam autem non tam id reprehendunt si remissius agatur sed tantum studium tamque multam operam ponendam in eo non arbitrantur erunt etiam et ii quidem eruditi Graecis litteris contemnentes Latinas qui se dicant in Graecis legendis operam malle consumere postremo aliquos futuros suspicor qui me ad alias litteras vocent genus hoc scribendi etsi sit elegans personae tamen et dignitatis esse negent Contra quos omnis dicendum breviter existimo Quamquam philosophiae quidem vituperatoribus satis responsum est eo libro quo a nobis philosophia defensa et collaudata est cum esset accusata et vituperata ab Hortensio qui liber cum et tibi probatus videretur et iis quos ego posse iudicare arbitrarer plura suscepi veritus ne movere hominum studia viderer retinere non posse Qui autem si maxime hoc placeat moderatius tamen id volunt fieri difficilem quandam temperantiam postulant in eo quod semel admissum coerceri reprimique non potest ut propemodum iustioribus utamur illis qui omnino avocent a philosophia quam his qui rebus infinitis modum constituant in reque eo meliore quo maior sit mediocritatem desiderent Sive enim ad sapientiam perveniri potest non paranda nobis solum ea sed fruenda etiam sapientia est sive hoc difficile est tamen nec modus est ullus investigandi veri nisi inveneris et quaerendi defatigatio turpis est cum id quod quaeritur sit pulcherrimum etenim si delectamur cum scribimus quis est tam invidus qui ab eo nos abducat sin laboramus quis est qui alienae modum statuat industriae nam ut Terentianus Chremes non inhumanus qui novum vicinum non vult fodere aut arare aut aliquid ferre denique non enim illum ab industria sed ab inliberali labore deterret sic isti curiosi quos offendit noster minime nobis iniucundus labor Iis igitur est difficilius satis facere qui se Latina scripta dicunt contemnere in quibus hoc primum est in quo admirer cur in gravissimis rebus non delectet eos sermo patrius cum idem fabellas Latinas ad verbum e Graecis expressas non inviti legant quis enim tam inimicus paene nomini Romano est qui Ennii Medeam aut Antiopam Pacuvii spernat aut reiciat quod se isdem Euripidis fabulis delectari dicat Latinas litteras oderit Quid si nos non interpretum fungimur munere sed tuemur ea quae dicta sunt ab iis quos probamus eisque nostrum iudicium et nostrum scribendi ordinem adiungimus quid habent cur Graeca anteponant iis quae et splendide dicta sint neque sint conversa de Graecis nam si dicent ab illis has res esse tractatas ne ipsos quidem Graecos est cur tam multos legant quam legendi sunt quid enim est a Chrysippo praetermissum in Stoicis legimus tamen Diogenem Antipatrum Mnesarchum Panaetium multos alios in primisque familiarem nostrum Posidonium quid Theophrastus mediocriterne delectat cum tractat locos ab Aristotele ante tractatos quid Epicurei num desistunt de isdem de quibus et ab Epicuro scriptum est et ab antiquis ad arbitrium suum scribere quodsi Graeci leguntur a Graecis isdem de rebus alia ratione compositis quid est cur nostri a nostris non legantur'.split(' ');